"""Per-user workspace API. API Gateway JWT authorizer supplies the Cognito subject."""
import base64,json,os,time
import boto3

TABLE=boto3.resource('dynamodb').Table(os.environ['WORKSPACE_TABLE'])
MAX_BYTES=180000

def response(status,body=None):
 result={'statusCode':status,'headers':{'content-type':'application/json','cache-control':'no-store'}}
 if body is not None:result['body']=json.dumps(body,separators=(',',':'))
 return result

def subject(event):
 return event.get('requestContext',{}).get('authorizer',{}).get('jwt',{}).get('claims',{}).get('sub')

def handler(event,context):
 sub=subject(event)
 if not sub:return response(401,{'message':'Unauthorized'})
 method=event.get('requestContext',{}).get('http',{}).get('method')
 if method=='GET':
  item=TABLE.get_item(Key={'userId':sub,'document':'workspace'}).get('Item')
  return response(200,item['workspace']) if item else response(404,{'message':'Not found'})
 if method!='PUT':return response(405,{'message':'Method not allowed'})
 try:
  raw=event.get('body','')
  if event.get('isBase64Encoded'):raw=base64.b64decode(raw).decode('utf-8')
  if len(raw.encode('utf-8'))>MAX_BYTES:raise ValueError()
  workspace=json.loads(raw)
  if workspace.get('schemaVersion')!=1 or not isinstance(workspace.get('teams'),dict) or not isinstance(workspace.get('library'),list):raise ValueError()
 except (ValueError,UnicodeDecodeError,json.JSONDecodeError,AttributeError):return response(400,{'message':'Invalid workspace'})
 TABLE.put_item(Item={'userId':sub,'document':'workspace','workspace':workspace,'updatedAt':int(time.time())})
 return response(200,{'updatedAt':workspace.get('updatedAt')})
