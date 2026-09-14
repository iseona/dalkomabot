import importlib.util,json,os,shutil,sys,tempfile,types
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
class Response:
 def __init__(self,data,url):self.data=data;self.url=url
 def __enter__(self):return self
 def __exit__(self,*_):pass
 def geturl(self):return self.url
 def read(self,*_):return self.data
class S3:
 def __init__(self):self.writes=[]
 def put_object(self,**kwargs):self.writes.append(kwargs)
s3=S3();fake=types.ModuleType('boto3');fake.client=lambda _:s3;sys.modules['boto3']=fake
with tempfile.TemporaryDirectory() as directory:
 package=Path(directory)
 for source,target in [('aws/collector.py','collector.py'),('scripts/import_opendata.py','import_opendata.py'),('dist/data.json','data.json')]:shutil.copy(ROOT/source,package/target)
 spec=importlib.util.spec_from_file_location('collector',package/'collector.py');collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
 source={mode:(ROOT/f'sources/s4_{mode}_ranked_teams.json').read_bytes() for mode in ('single','double')}
 collector.urllib.request.urlopen=lambda request,timeout:Response(source['single' if 'single' in request.full_url else 'double'],request.full_url)
 os.environ['DATA_BUCKET']='test-bucket';result=collector.handler({},None)
 assert result['status']=='updated' and len(s3.writes)==1
 saved=json.loads(s3.writes[0]['Body'])
 for mode in ('single','double'):
  meta=saved['modes'][mode]['metadata'];assert meta['mode']==mode and meta['season']=='M-4';assert meta['sample']['teams']==saved['modes'][mode]['count'];assert meta['source'].startswith('https://champs.pokedb.tokyo')
 s3.writes.clear();bad=json.loads(source['single']);bad['teams'][0]['team'][0]['id']='unknown'
 collector.urllib.request.urlopen=lambda request,timeout:Response(json.dumps(bad).encode(),request.full_url)
 try:collector.handler({},None);raise AssertionError('invalid source should fail')
 except (AssertionError,ValueError):pass
 assert not s3.writes
print('PASS: collector publishes validated mode metadata atomically and retains prior data on failure.')
