import importlib.util,json,os,shutil,sys,tempfile,types
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
template=json.loads((ROOT/'aws/template.json').read_text())
collector_policy=json.dumps(template['Resources']['CollectorRole']['Properties']['Policies'],sort_keys=True)
assert 's3:GetObject' in collector_policy and 's3:ListBucket' in collector_policy and '${SiteBucket.Arn}/seasons/*' in collector_policy
class Response:
 def __init__(self,data,url):self.data=data;self.url=url
 def __enter__(self):return self
 def __exit__(self,*_):pass
 def geturl(self):return self.url
 def read(self,*_):return self.data
class S3:
 def __init__(self):self.writes=[];self.objects={}
 def put_object(self,**kwargs):self.writes.append(kwargs);self.objects[kwargs['Key']]=kwargs
 def head_object(self,**kwargs):
  if kwargs['Key'] not in self.objects:raise Missing()
  return {'Metadata':self.objects[kwargs['Key']].get('Metadata',{})}
 def get_object(self,**kwargs):
  if kwargs['Key'] not in self.objects:raise Missing()
  return {'Body':Response(self.objects[kwargs['Key']]['Body'],'')}
class Missing(Exception):
 response={'Error':{'Code':'404'}}
s3=S3();fake=types.ModuleType('boto3');fake.client=lambda _:s3;sys.modules['boto3']=fake
with tempfile.TemporaryDirectory() as directory:
 package=Path(directory)
 for source,target in [('aws/collector.py','collector.py'),('scripts/import_opendata.py','import_opendata.py'),('dist/data.json','data.json')]:shutil.copy(ROOT/source,package/target)
 spec=importlib.util.spec_from_file_location('collector',package/'collector.py');collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
 source={mode:(ROOT/f'sources/s5_{mode}_ranked_teams.json').read_bytes() for mode in ('single','double')}
 guide=b'<a href="/opendata/s4_single_ranked_teams.json"><a href="/opendata/s4_double_ranked_teams.json"><a href="/opendata/s5_single_ranked_teams.json"><a href="/opendata/s5_double_ranked_teams.json">'
 usage=(r'x\"table\":{\"seasons\":[\"M-5\",\"M-6\"],\"format\":\"single\",\"rows\":[{\"id\":\"salamence\",\"name\":\"ボーマンダ\",\"ranks\":[null,1]},{\"id\":\"garchomp\",\"name\":\"ガブリアス\",\"ranks\":[1,2]}]} y \"table\":{\"seasons\":[\"M-5\",\"M-6\"],\"format\":\"double\",\"rows\":[{\"id\":\"sneasler\",\"name\":\"オオニューラ\",\"ranks\":[1,1]}]}').encode()
 def fetch(request,timeout):
  if request.full_url.endswith('/guide/opendata'):return Response(guide,request.full_url)
  if request.full_url.endswith('/usage'):return Response(usage,request.full_url)
  return Response(source['single' if 'single' in request.full_url else 'double'],request.full_url)
 collector.urllib.request.urlopen=fetch
 os.environ['DATA_BUCKET']='test-bucket';result=collector.handler({},None)
 assert result['status']=='updated' and result['season']=='M-5'
 assert [write['Key'] for write in s3.writes]==['seasons/M-5/single.json','seasons/M-5/double.json','seasons/M-6/single.json','seasons/M-6/double.json','opendata.json','seasons/index.json']
 saved=json.loads(s3.objects['opendata.json']['Body']);index=json.loads(s3.objects['seasons/index.json']['Body'])
 assert index['latest']=='M-6' and index['latestPublishedTeams']=='M-5'
 assert index['seasons'][0]['regulation']=='M-C' and index['seasons'][0]['metrics']==['inGameUsageRank']
 m6=json.loads(s3.objects['seasons/M-6/single.json']['Body'])
 assert m6['usageRanking']['ranking'][0]['sourceId']=='salamence' and m6['settings']['status']=='unavailable'
 for mode in ('single','double'):
  meta=saved['modes'][mode]['metadata'];assert meta['mode']==mode and meta['season']=='M-5';assert meta['sample']['teams']==saved['modes'][mode]['count'];assert meta['source'].startswith('https://champs.pokedb.tokyo')
 assert saved['modes']['single']['metadata']['excludedTeams']==1
 first_snapshot_writes=len(s3.writes);collector.handler({},None)
 assert len([write for write in s3.writes[first_snapshot_writes:] if write['Key'].startswith('seasons/M-5/')])==0
 previous_index=s3.objects['seasons/index.json']['Body'];s3.writes.clear();bad=json.loads(source['single']);bad['season']='M-4'
 collector.urllib.request.urlopen=lambda request,timeout:Response(guide,request.full_url) if request.full_url.endswith('/guide/opendata') else Response(usage,request.full_url) if request.full_url.endswith('/usage') else Response(json.dumps(bad).encode(),request.full_url)
 try:collector.handler({},None);raise AssertionError('invalid source should fail')
 except (AssertionError,ValueError):pass
 assert not s3.writes
 assert s3.objects['seasons/index.json']['Body']==previous_index
print('PASS: collector publishes validated mode metadata atomically and retains prior data on failure.')
