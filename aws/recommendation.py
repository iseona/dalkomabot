"""Bounded OpenAI explanation proxy; deterministic scores stay client-owned."""
import json, os, time, urllib.request, urllib.error
from pathlib import Path
import boto3

MODEL=os.environ.get('OPENAI_MODEL','gpt-5.6-luna'); SECRET_ID=os.environ['OPENAI_SECRET_ID']; TABLE=os.environ['RATE_TABLE']; LIMIT=int(os.environ.get('MAX_DAILY_REQUESTS','50'))
DATA=json.loads(Path(__file__).with_name('data.json').read_text(encoding='utf-8')); ALLOWED={p['name'] for group in DATA['modes'].values() for p in group}|{p[0] for p in DATA.get('master',{}).get('pokemon',[]) if isinstance(p,list) and p}
ddb=boto3.client('dynamodb'); secrets=boto3.client('secretsmanager')
SCHEMA={'type':'object','additionalProperties':False,'required':['schemaVersion','advice'],'properties':{'schemaVersion':{'type':'integer','enum':[1]},'advice':{'type':'array','maxItems':3,'items':{'type':'object','additionalProperties':False,'required':['name','summary','evidenceIds'],'properties':{'name':{'type':'string'},'summary':{'type':'string','maxLength':360},'evidenceIds':{'type':'array','minItems':1,'maxItems':8,'items':{'type':'string'}}}}}}}
def reply(status,body): return {'statusCode':status,'headers':{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'},'body':json.dumps(body,ensure_ascii=False)}
def quota():
 day=time.strftime('%Y-%m-%d',time.gmtime()); ddb.update_item(TableName=TABLE,Key={'day':{'S':day}},UpdateExpression='SET expiresAt = :ttl ADD requests :one',ConditionExpression='attribute_not_exists(requests) OR requests < :limit',ExpressionAttributeValues={':ttl':{'N':str(int(time.time())+172800)},':one':{'N':'1'},':limit':{'N':str(LIMIT)}})
def output_text(value):
 if isinstance(value.get('output_text'),str): return value['output_text']
 for item in value.get('output',[]):
  for content in item.get('content',[]):
   if content.get('type')=='output_text': return content.get('text','')
 raise ValueError('no output text')
def validate_input(body):
 if not isinstance(body,dict) or body.get('schemaVersion')!=1 or body.get('mode') not in ('single','double') or body.get('kind') not in ('add','replace'): raise ValueError('invalid request')
 if not isinstance(body.get('season'),str) or len(body['season'])>80 or not isinstance(body.get('selected'),list) or len(body['selected'])>6: raise ValueError('invalid request')
 candidates,evidence=body.get('candidates'),body.get('evidence'); ids=set(); names=set()
 if not isinstance(candidates,list) or not 1<=len(candidates)<=3 or not isinstance(evidence,list) or len(evidence)>40: raise ValueError('invalid request')
 for e in evidence:
  if not isinstance(e,dict) or not isinstance(e.get('id'),str) or e['id'] in ids or not isinstance(e.get('text'),str) or len(e['text'])>280: raise ValueError('invalid evidence')
  ids.add(e['id'])
 for c in candidates:
  if not isinstance(c,dict) or c.get('name') not in ALLOWED or c['name'] in names or not isinstance(c.get('score'),int) or not 0<=c['score']<=100 or not isinstance(c.get('evidenceIds'),list) or not c['evidenceIds'] or any(x not in ids for x in c['evidenceIds']): raise ValueError('invalid candidate')
  names.add(c['name'])
 return body,names,{c['name']:set(c['evidenceIds']) for c in candidates}
def handler(event,context):
 try:
  if event.get('requestContext',{}).get('http',{}).get('method')=='OPTIONS': return reply(204,{})
  raw=event.get('body') or '{}'
  if len(raw.encode())>24000:return reply(413,{'error':'AI 제언 요청이 너무 큽니다.'})
  body,names,candidate_ids=validate_input(json.loads(raw)); quota()
  prompt='제공된 후보, 점수, 근거만 사용해 한국어로 간결히 설명하라. 수치, 기술, 상성, 시즌을 만들거나 점수와 순서를 변경하지 마라. evidenceIds만 인용하라.\n'+json.dumps(body,ensure_ascii=False,separators=(',',':'))
  key=secrets.get_secret_value(SecretId=SECRET_ID)['SecretString']; request={'model':MODEL,'store':False,'max_output_tokens':700,'reasoning':{'effort':'low'},'input':[{'role':'user','content':[{'type':'input_text','text':prompt}]}],'text':{'verbosity':'low','format':{'type':'json_schema','name':'party_advice','strict':True,'schema':SCHEMA}}}
  req=urllib.request.Request('https://api.openai.com/v1/responses',data=json.dumps(request).encode(),headers={'authorization':'Bearer '+key,'content-type':'application/json'})
  with urllib.request.urlopen(req,timeout=25) as response: output=json.loads(output_text(json.loads(response.read())))
  for item in output.get('advice',[]):
   if item.get('name') not in names or not isinstance(item.get('summary'),str) or len(item['summary'])>360 or not item.get('evidenceIds') or any(x not in candidate_ids[item['name']] for x in item['evidenceIds']): raise ValueError('unsupported model claim')
  return reply(200,output)
 except ddb.exceptions.ConditionalCheckFailedException:return reply(429,{'error':'오늘 AI 제언 사용 한도에 도달했습니다.'})
 except (ValueError,json.JSONDecodeError):return reply(400,{'error':'AI 제언 요청 또는 응답 형식이 잘못되었습니다.'})
 except urllib.error.HTTPError:return reply(502,{'error':'AI 제언 서비스가 실패했습니다.'})
 except Exception as error: print(type(error).__name__,str(error)[:200]); return reply(500,{'error':'AI 제언 서버 오류가 발생했습니다.'})
