"""Deploy the prepared app to the caller's AWS account. Run only when ready to create AWS resources."""
import argparse,json,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def aws(*args,capture=False):
 r=subprocess.run(['aws',*args],check=True,text=True,capture_output=capture)
 return json.loads(r.stdout) if capture else None
p=argparse.ArgumentParser();p.add_argument('--region',default='ap-northeast-2');p.add_argument('--stack',default='champions-party-lab');p.add_argument('--discord-public-key',default='');a=p.parse_args()
aws('sts','get-caller-identity')
aws('cloudformation','deploy','--region',a.region,'--stack-name',a.stack,'--template-file',str(ROOT/'aws/template.json'),'--capabilities','CAPABILITY_IAM','--parameter-overrides','DiscordPublicKey='+a.discord_public_key)
info=aws('cloudformation','describe-stacks','--region',a.region,'--stack-name',a.stack,capture=True)
o={x['OutputKey']:x['OutputValue'] for x in info['Stacks'][0]['Outputs']}
# Image/data refreshes are maintenance jobs, not deployment jobs.  The release
# archive contains the already validated assets so CloudShell deployment stays
# fast and cannot silently change the recognition database.
aws('s3','sync',str(ROOT/'dist'),'s3://'+o['BucketName'],'--region',a.region,'--cache-control','public,max-age=300')
for file,content_type in [('index.html','text/html; charset=utf-8'),('manifest.webmanifest','application/manifest+json')]:
 aws('s3','cp',str(ROOT/'dist'/file),'s3://'+o['BucketName']+'/'+file,'--region',a.region,'--cache-control','no-cache, no-store, must-revalidate','--content-type',content_type,'--metadata-directive','REPLACE')
with zipfile.ZipFile(ROOT/'aws/collector.zip','w',zipfile.ZIP_DEFLATED) as z:
 for src,name in [(ROOT/'aws/collector.py','collector.py'),(ROOT/'scripts/import_opendata.py','import_opendata.py'),(ROOT/'dist/data.json','data.json')]:z.write(src,name)
aws('lambda','update-function-code','--region',a.region,'--function-name',o['CollectorName'],'--zip-file','fileb://'+str(ROOT/'aws/collector.zip'))
aws('lambda','wait','function-updated','--region',a.region,'--function-name',o['CollectorName'])
invalidation=aws('cloudfront','create-invalidation','--distribution-id',o['DistributionId'],'--paths','/*',capture=True)
aws('cloudfront','wait','invalidation-completed','--distribution-id',o['DistributionId'],'--id',invalidation['Invalidation']['Id'])
print(o['SiteUrl'])
print('CloudFront cache refresh completed.')
print('Scheduled refresh is disabled. Enable after reviewing the collector and confirming a successful manual invocation.')

if 'DiscordFunctionName' in o:
 with zipfile.ZipFile(ROOT/'aws/discord.zip','w',zipfile.ZIP_DEFLATED) as z:
  for src,name in [(ROOT/'discord/handler.mjs','handler.mjs'),(ROOT/'dist/engine.mjs','engine.mjs'),(ROOT/'dist/types.mjs','types.mjs'),(ROOT/'dist/data.json','data.json'),(ROOT/'dist/opendata.json','opendata.json')]:z.write(src,name)
 aws('lambda','update-function-code','--region',a.region,'--function-name',o['DiscordFunctionName'],'--zip-file','fileb://'+str(ROOT/'aws/discord.zip'))
 aws('lambda','wait','function-updated','--region',a.region,'--function-name',o['DiscordFunctionName'])
 print('Discord Interactions Endpoint: '+o['DiscordEndpoint'])
