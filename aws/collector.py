"""AWS Lambda collector: fetch each approved Champions file once, validate, then publish atomically."""
import hashlib,json,os,shutil,subprocess,sys,tempfile,urllib.request
from pathlib import Path

def handler(event,context):
 import boto3
 bucket=os.environ['DATA_BUCKET']
 with tempfile.TemporaryDirectory() as td:
  root=Path(td);(root/'sources').mkdir();(root/'dist').mkdir()
  shutil.copy(Path(__file__).with_name('data.json'),root/'dist/data.json')
  for mode in ['single','double']:
   url=f'https://champs.pokedb.tokyo/opendata/s4_{mode}_ranked_teams.json'
   req=urllib.request.Request(url,headers={'User-Agent':'ChampionsPartyLab/1.0 (daily cached data import)'})
   with urllib.request.urlopen(req,timeout=30) as r:
    if r.geturl()!=url:raise ValueError('Unexpected redirect; source approval required')
    raw=r.read(5_000_001)
    if len(raw)>5_000_000:raise ValueError('Source size exceeds limit')
   value=json.loads(raw)
   if value.get('season')!='M-4' or value.get('rule')!=('シングル' if mode=='single' else 'ダブル'):raise ValueError('Season or mode mismatch')
   if not isinstance(value.get('teams'),list) or not value['teams']:raise ValueError('Empty source')
   (root/f'sources/s4_{mode}_ranked_teams.json').write_bytes(raw)
  env=dict(os.environ,CHAMPIONS_ROOT=str(root))
  subprocess.run([sys.executable,str(Path(__file__).with_name('import_opendata.py'))],env=env,check=True,capture_output=True,timeout=30)
  data=(root/'dist/opendata.json').read_bytes()
  digest=hashlib.sha256(data).hexdigest()
  # No write occurs before both modes and every name pass validation.
  boto3.client('s3').put_object(Bucket=bucket,Key='opendata.json',Body=data,ContentType='application/json; charset=utf-8',CacheControl='public,max-age=300',Metadata={'sha256':digest})
  return {'status':'updated','sha256':digest}
