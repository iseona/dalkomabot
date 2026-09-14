"""Deploy the prepared app to the caller's AWS account. Run only when ready to create AWS resources."""
import argparse,json,os,subprocess,tempfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def aws(*args,capture=False):
 r=subprocess.run(['aws',*args],check=True,text=True,capture_output=capture)
 return json.loads(r.stdout) if capture else None
p=argparse.ArgumentParser();p.add_argument('--region',default='ap-northeast-2');p.add_argument('--stack',default='champions-party-lab');p.add_argument('--discord-public-key',default='');p.add_argument('--openai-model',default='gpt-5.6-luna');p.add_argument('--max-daily-recognition-requests',type=int,default=100);p.add_argument('--max-daily-recommendation-requests',type=int,default=50);p.add_argument('--enable-collector-schedule',action='store_true',help='Enable daily collection after manual verification.');p.add_argument('--run-collector',action='store_true',help='Invoke collector synchronously and verify its published object.');p.add_argument('--google-client-id',default=os.environ.get('GOOGLE_CLIENT_ID',''));p.add_argument('--cognito-domain-prefix',default=os.environ.get('COGNITO_DOMAIN_PREFIX',''));p.add_argument('--preserve-google-config',action='store_true',help='On an existing stack, keep the current Google OAuth parameters, including the NoEcho secret.');a=p.parse_args()
key=os.environ.get('OPENAI_API_KEY','').strip()
google_secret=os.environ.get('GOOGLE_CLIENT_SECRET','').strip()
if not 1<=a.max_daily_recognition_requests<=1000:raise SystemExit('Daily recognition limit must be between 1 and 1000.')
if not a.preserve_google_config and (not a.google_client_id or not google_secret or not a.cognito_domain_prefix):raise SystemExit('Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and COGNITO_DOMAIN_PREFIX before deploying, or use --preserve-google-config for an existing stack.')
aws('sts','get-caller-identity')
overrides=['DiscordPublicKey='+a.discord_public_key,'OpenAIModel='+a.openai_model,'MaxDailyRecognitionRequests='+str(a.max_daily_recognition_requests),'MaxDailyRecommendationRequests='+str(a.max_daily_recommendation_requests),'EnableCollectorSchedule='+str(a.enable_collector_schedule).lower()]
if not a.preserve_google_config:overrides+=['GoogleClientId='+a.google_client_id,'GoogleClientSecret='+google_secret,'CognitoDomainPrefix='+a.cognito_domain_prefix]
aws('cloudformation','deploy','--region',a.region,'--stack-name',a.stack,'--template-file',str(ROOT/'aws/template.json'),'--capabilities','CAPABILITY_IAM','--parameter-overrides',*overrides)
info=aws('cloudformation','describe-stacks','--region',a.region,'--stack-name',a.stack,capture=True)
o={x['OutputKey']:x['OutputValue'] for x in info['Stacks'][0]['Outputs']}
if key:aws('secretsmanager','put-secret-value','--region',a.region,'--secret-id',o['RecognitionSecretId'],'--secret-string',key)
(ROOT/'dist/runtime-config.js').write_text('window.DALKOMA_CONFIG='+json.dumps({'recognitionEndpoint':o['RecognitionEndpoint'],'recommendationEndpoint':o['RecommendationEndpoint'],'cloudEndpoint':o['CloudWorkspaceEndpoint'],'cognitoClientId':o['CognitoClientId'],'cognitoDomain':o['CognitoDomain']},separators=(',',':'))+';\n',encoding='utf-8')
with zipfile.ZipFile(ROOT/'aws/recognizer.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.write(ROOT/'aws/recognizer.py','recognizer.py');z.write(ROOT/'dist/data.json','data.json')
aws('lambda','update-function-code','--region',a.region,'--function-name',o['RecognitionFunctionName'],'--zip-file','fileb://'+str(ROOT/'aws/recognizer.zip'))
aws('lambda','wait','function-updated','--region',a.region,'--function-name',o['RecognitionFunctionName'])
with zipfile.ZipFile(ROOT/'aws/recommendation.zip','w',zipfile.ZIP_DEFLATED) as z:
 for src,name in [(ROOT/'aws/recommendation.py','recommendation.py'),(ROOT/'dist/data.json','data.json')]:z.write(src,name)
aws('lambda','update-function-code','--region',a.region,'--function-name',o['RecommendationFunctionName'],'--zip-file','fileb://'+str(ROOT/'aws/recommendation.zip'))
aws('lambda','wait','function-updated','--region',a.region,'--function-name',o['RecommendationFunctionName'])
with zipfile.ZipFile(ROOT/'aws/cloud_storage.zip','w',zipfile.ZIP_DEFLATED) as z:z.write(ROOT/'aws/cloud_storage.py','cloud_storage.py')
aws('lambda','update-function-code','--region',a.region,'--function-name',o['WorkspaceFunctionName'],'--zip-file','fileb://'+str(ROOT/'aws/cloud_storage.zip'))
aws('lambda','wait','function-updated','--region',a.region,'--function-name',o['WorkspaceFunctionName'])
# Image/data refreshes are maintenance jobs, not deployment jobs.  The release
# archive contains the already validated assets so CloudShell deployment stays
# fast and cannot silently change the recognition database.
aws('s3','sync',str(ROOT/'dist'),'s3://'+o['BucketName'],'--region',a.region,'--cache-control','public,max-age=300','--exclude','recognition/*','--exclude','vendor/ocr/*')
aws('s3','rm','s3://'+o['BucketName']+'/vendor/ocr','--region',a.region,'--recursive')
for file,content_type in [('index.html','text/html; charset=utf-8'),('manifest.webmanifest','application/manifest+json'),('runtime-config.js','application/javascript; charset=utf-8')]:
 aws('s3','cp',str(ROOT/'dist'/file),'s3://'+o['BucketName']+'/'+file,'--region',a.region,'--cache-control','no-cache, no-store, must-revalidate','--content-type',content_type,'--metadata-directive','REPLACE')
with zipfile.ZipFile(ROOT/'aws/collector.zip','w',zipfile.ZIP_DEFLATED) as z:
 for src,name in [(ROOT/'aws/collector.py','collector.py'),(ROOT/'scripts/import_opendata.py','import_opendata.py'),(ROOT/'dist/data.json','data.json')]:z.write(src,name)
aws('lambda','update-function-code','--region',a.region,'--function-name',o['CollectorName'],'--zip-file','fileb://'+str(ROOT/'aws/collector.zip'))
aws('lambda','wait','function-updated','--region',a.region,'--function-name',o['CollectorName'])
if a.run_collector:
 with tempfile.NamedTemporaryFile(suffix='.json',delete=False) as response:response_path=Path(response.name)
 try:
  result=aws('lambda','invoke','--region',a.region,'--function-name',o['CollectorName'],'--invocation-type','RequestResponse','--cli-binary-format','raw-in-base64-out','--payload','{}',str(response_path),capture=True)
  payload=json.loads(response_path.read_text(encoding='utf-8'))
 finally:response_path.unlink(missing_ok=True)
 if result.get('FunctionError') or payload.get('status')!='updated':raise SystemExit('Collector invocation failed: '+json.dumps(payload,ensure_ascii=False))
 head=aws('s3api','head-object','--region',a.region,'--bucket',o['BucketName'],'--key','opendata.json',capture=True)
 if head.get('Metadata',{}).get('sha256')!=payload.get('sha256'):raise SystemExit('Collector verification failed: published sha256 does not match invocation result.')
 print('Collector verified:',json.dumps(payload['modes'],ensure_ascii=False))
invalidation=aws('cloudfront','create-invalidation','--distribution-id',o['DistributionId'],'--paths','/*',capture=True)
aws('cloudfront','wait','invalidation-completed','--distribution-id',o['DistributionId'],'--id',invalidation['Invalidation']['Id'])
print(o['SiteUrl'])
print('CloudFront cache refresh completed.')
print(f'AI recognition is limited to {a.max_daily_recognition_requests} requests per UTC day.')
print('Scheduled refresh is '+('enabled.' if a.enable_collector_schedule else 'disabled.'))
if not a.enable_collector_schedule:print('After a successful manual verification, redeploy with --enable-collector-schedule.')

if 'DiscordFunctionName' in o:
 with zipfile.ZipFile(ROOT/'aws/discord.zip','w',zipfile.ZIP_DEFLATED) as z:
  for src,name in [(ROOT/'discord/handler.mjs','handler.mjs'),(ROOT/'dist/engine.mjs','engine.mjs'),(ROOT/'dist/types.mjs','types.mjs'),(ROOT/'dist/data.json','data.json'),(ROOT/'dist/opendata.json','opendata.json')]:z.write(src,name)
 aws('lambda','update-function-code','--region',a.region,'--function-name',o['DiscordFunctionName'],'--zip-file','fileb://'+str(ROOT/'aws/discord.zip'))
 aws('lambda','wait','function-updated','--region',a.region,'--function-name',o['DiscordFunctionName'])
 print('Discord Interactions Endpoint: '+o['DiscordEndpoint'])
