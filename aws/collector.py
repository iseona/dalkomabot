"""AWS Lambda collector: fetch each approved Champions file once, validate, then publish atomically."""
import hashlib,html,json,os,re,shutil,subprocess,sys,tempfile,urllib.request
from pathlib import Path

def usage_snapshots(page):
 text=html.unescape(page.decode()).replace('\\"','"');decoder=json.JSONDecoder();tables=[];cursor=0
 while True:
  cursor=text.find('"table":',cursor)
  if cursor<0:break
  try:value,end=decoder.raw_decode(text,cursor+8)
  except json.JSONDecodeError:cursor+=8;continue
  cursor=end
  if value.get('format') in ('single','double') and value.get('seasons') and value.get('rows'):tables.append(value)
 tables={table['format']:table for table in tables}
 if set(tables)!={'single','double'}:raise ValueError('Complete usage rank tables not found')
 result={}
 for mode,table in tables.items():
  for index,season in enumerate(table['seasons']):
   rows=sorted(({'rank':row['ranks'][index],'sourceId':row['id'],'sourceName':row['name'],'sourceForm':row.get('formName','')} for row in table['rows'] if row['ranks'][index] is not None),key=lambda row:row['rank'])
   result.setdefault(season,{})[mode]={'metric':'inGameUsageRank','ranking':rows,'source':'https://pokemonics.com/usage'}
 return result

def handler(event,context):
 import boto3
 bucket=os.environ['DATA_BUCKET'];s3=boto3.client('s3')
 with tempfile.TemporaryDirectory() as td:
  root=Path(td);(root/'sources').mkdir();(root/'dist').mkdir()
  shutil.copy(Path(__file__).with_name('data.json'),root/'dist/data.json')
  guide='https://champs.pokedb.tokyo/guide/opendata'
  req=urllib.request.Request(guide,headers={'User-Agent':'ChampionsPartyLab/1.0 (daily cached data import)'})
  with urllib.request.urlopen(req,timeout=30) as r:
   if r.geturl()!=guide:raise ValueError('Unexpected guide redirect')
   listing=r.read(1_000_001)
   if len(listing)>1_000_000:raise ValueError('Guide size exceeds limit')
  names={(int(n),mode) for n,mode in re.findall(rb's(\d+)_(single|double)_ranked_teams\.json',listing)}
  complete=[n for n in {number for number,_ in names} if all((n,mode.encode()) in names for mode in ('single','double'))]
  if not complete:raise ValueError('No complete published season')
  season=max(complete)
  for mode in ['single','double']:
   url=f'https://champs.pokedb.tokyo/opendata/s{season}_{mode}_ranked_teams.json'
   req=urllib.request.Request(url,headers={'User-Agent':'ChampionsPartyLab/1.0 (daily cached data import)'})
   with urllib.request.urlopen(req,timeout=30) as r:
    if r.geturl()!=url:raise ValueError('Unexpected redirect; source approval required')
    raw=r.read(5_000_001)
    if len(raw)>5_000_000:raise ValueError('Source size exceeds limit')
   value=json.loads(raw)
   if value.get('season')!=f'M-{season}' or value.get('rule')!=('シングル' if mode=='single' else 'ダブル'):raise ValueError('Season or mode mismatch')
   if not isinstance(value.get('teams'),list) or not value['teams']:raise ValueError('Empty source')
   (root/f'sources/s{season}_{mode}_ranked_teams.json').write_bytes(raw)
  usage_pages=[]
  for usage_url in ('https://pokemonics.com/usage','https://pokemonics.com/usage/double'):
   req=urllib.request.Request(usage_url,headers={'User-Agent':'ChampionsPartyLab/1.0 (daily cached rank import)'})
   with urllib.request.urlopen(req,timeout=30) as r:
    if r.geturl()!=usage_url:raise ValueError('Unexpected usage redirect')
    usage_raw=r.read(2_000_001)
    if len(usage_raw)>2_000_000:raise ValueError('Usage source size exceeds limit')
    usage_pages.append(usage_raw)
  usage=usage_snapshots(b'\n'.join(usage_pages))
  env=dict(os.environ,CHAMPIONS_ROOT=str(root))
  subprocess.run([sys.executable,str(Path(__file__).with_name('import_opendata.py'))],env=env,check=True,capture_output=True,timeout=30)
  data=(root/'dist/opendata.json').read_bytes()
  published=json.loads(data)
  metadata={mode:published['modes'][mode]['metadata'] for mode in ['single','double']}
  digest=hashlib.sha256(data).hexdigest()
  # Versioned mode objects are written first. The index is the atomic commit
  # point, so a partial failure leaves the previous season catalogue usable.
  season_name=f'M-{season}';snapshot_keys={}
  all_seasons=sorted(usage,key=lambda value:int(value.split('-')[1]))
  latest_usage=all_seasons[-1]
  for saved_season in all_seasons:
   for mode in ('single','double'):
    snapshot={'schemaVersion':1,'season':saved_season,'mode':mode,'usageRanking':usage[saved_season][mode],'settings':{'status':'unavailable','reason':'No validated same-season settings snapshot'}}
    if saved_season==season_name:snapshot['publishedTeams']=published['modes'][mode]
    body=json.dumps(snapshot,ensure_ascii=False,separators=(',',':')).encode()
    key=f'seasons/{saved_season}/{mode}.json'
    if saved_season==season_name:snapshot_keys[mode]=key
    sha=hashlib.sha256(body).hexdigest()
    try:
     prior=s3.head_object(Bucket=bucket,Key=key).get('Metadata',{}).get('sha256')
    except Exception as error:
     code=getattr(error,'response',{}).get('Error',{}).get('Code')
     if str(code) not in ('404','NoSuchKey','NotFound'):raise
     prior=None
    if prior and prior!=sha and saved_season!=latest_usage:continue # Closed seasons remain immutable.
    if prior!=sha:s3.put_object(Bucket=bucket,Key=key,Body=body,ContentType='application/json; charset=utf-8',CacheControl='public,max-age=300' if saved_season==latest_usage else 'public,max-age=31536000,immutable',Metadata={'sha256':sha})
  # The current season may not have published-team open data yet.
  try:index=json.loads(s3.get_object(Bucket=bucket,Key='seasons/index.json')['Body'].read())
  except Exception as error:
   code=getattr(error,'response',{}).get('Error',{}).get('Code')
   if str(code) not in ('404','NoSuchKey','NotFound'):raise
   index={'schemaVersion':1,'seasons':[]}
  entries={row['season']:row for row in index.get('seasons',[])}
  for saved_season in all_seasons:
   metrics=['inGameUsageRank'];
   if saved_season==season_name:metrics.append('publishedTeamFrequency')
   entries.setdefault(saved_season,{'season':saved_season,'modes':{mode:f'seasons/{saved_season}/{mode}.json' for mode in ('single','double')},'regulation':{'M-1':'M-A','M-2':'M-A','M-3':'M-B','M-4':'M-B','M-5':'M-B','M-6':'M-C'}.get(saved_season),'source':'https://pokemonics.com/usage','metrics':metrics})
  index={'schemaVersion':1,'latest':latest_usage,'latestPublishedTeams':season_name,'seasons':[entries[key] for key in sorted(entries,key=lambda value:int(value.split('-')[1]),reverse=True)]}
  index_data=json.dumps(index,ensure_ascii=False,separators=(',',':')).encode()
  # Keep the legacy latest alias, then publish the catalogue last.
  s3.put_object(Bucket=bucket,Key='opendata.json',Body=data,ContentType='application/json; charset=utf-8',CacheControl='public,max-age=300',Metadata={'sha256':digest})
  s3.put_object(Bucket=bucket,Key='seasons/index.json',Body=index_data,ContentType='application/json; charset=utf-8',CacheControl='public,max-age=300')
  return {'status':'updated','sha256':digest,'season':season_name,'modes':metadata}
