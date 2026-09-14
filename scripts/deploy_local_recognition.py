"""Narrow, backed-up static recognition release. No Lambda/env/data changes."""
import hashlib,json,mimetypes,sys,tempfile,time,re,posixpath
from pathlib import Path
import boto3

root=Path(__file__).resolve().parent
manifest=json.loads((root/'release-manifest.json').read_text())
s3=boto3.client('s3',region_name='ap-northeast-2')
cf=boto3.client('cloudformation',region_name='ap-northeast-2')
outputs={r['OutputKey']:r['OutputValue'] for r in cf.describe_stacks(StackName='champions-party-lab')['Stacks'][0]['Outputs']}
bucket=outputs['BucketName'];distribution=outputs['DistributionId']
assert bucket=='champions-party-lab-sitebucket-my9kjzgxfges'
assert distribution=='EI2NSQBJ1ARON'
files=manifest['files']
assert all(k not in ('runtime-config.js','data.json','opendata.json') and '..' not in k and not k.startswith('/') for k in files)
for key,digest in files.items():assert hashlib.sha256((root/'dist'/key).read_bytes()).hexdigest()==digest,key
# Validate the complete module graph before the first write. A local-only
# dependency must not turn the published application into a blank shell.
checked=set()
def check_imports(key):
 if key in checked:return
 checked.add(key)
 body=(root/'dist'/key).read_bytes() if key in files else s3.get_object(Bucket=bucket,Key=key)['Body'].read()
 if not key.endswith(('.js','.mjs')):return
 for match in re.finditer(r'''(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]''',body.decode('utf-8')):
  dependency=posixpath.normpath(posixpath.join(posixpath.dirname(key),match.group(1).split('?')[0]))
  assert not dependency.startswith('../')
  check_imports(dependency)
for key in files:
 if key.endswith(('.js','.mjs')):check_imports(key)
remote_master=json.loads(s3.get_object(Bucket=bucket,Key='data.json')['Body'].read())['master']
assert hashlib.sha256(json.dumps(remote_master,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()==manifest['masterHash'],'Production master differs from tested master; stop and inspect'
print(json.dumps({'bucket':bucket,'files':list(files),'lambdaChanged':False,'dataChanged':False,'apply':'--apply' in sys.argv}))
if '--apply' not in sys.argv:raise SystemExit(0)
backup=Path(tempfile.mkdtemp(prefix='recognition-release-backup-',dir='/home/cloudshell-user'))
old={};written=[]
for key in files:
 try:
  result=s3.get_object(Bucket=bucket,Key=key)
  body=result['Body'].read();path=backup/key;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(body)
  old[key]={k:result[k] for k in ['ContentType','CacheControl','ContentEncoding','ContentDisposition','Metadata'] if k in result}
 except s3.exceptions.NoSuchKey:old[key]=None
(backup/'metadata.json').write_text(json.dumps(old,indent=2))
print('BACKUP',str(backup),flush=True)
try:
 for key in sorted(files,key=lambda k:k=='index.html'):
  content_type='application/javascript' if key.endswith(('.js','.mjs')) else mimetypes.guess_type(key)[0] or 'application/octet-stream'
  body=(root/'dist'/key).read_bytes()
  s3.put_object(Bucket=bucket,Key=key,Body=body,ContentType=content_type,CacheControl='no-cache',Metadata={'sha256':files[key]})
  written.append(key)
  assert hashlib.sha256(s3.get_object(Bucket=bucket,Key=key)['Body'].read()).hexdigest()==files[key]
except Exception:
 for key in written:
  if old[key] is not None:s3.put_object(Bucket=bucket,Key=key,Body=(backup/key).read_bytes(),**old[key])
 raise
cloudfront=boto3.client('cloudfront')
result=cloudfront.create_invalidation(DistributionId=distribution,InvalidationBatch={'Paths':{'Quantity':1,'Items':['/*']},'CallerReference':'local-recognition-'+str(time.time_ns())})
report={'status':'uploaded','backup':str(backup),'invalidation':result['Invalidation']['Id'],'files':files,'site':outputs['SiteUrl'],'lambdaChanged':False}
(backup/'release-result.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
