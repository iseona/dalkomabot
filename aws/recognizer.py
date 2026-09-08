"""Small, bounded OpenAI vision proxy for Champions screenshots."""
import base64,json,os,time,urllib.error,urllib.request
from pathlib import Path
import boto3

MODEL=os.environ.get('OPENAI_MODEL','gpt-4o-mini-2024-07-18')
MAX_DAILY=int(os.environ.get('MAX_DAILY_REQUESTS','100'))
SECRET_ID=os.environ['OPENAI_SECRET_ID']
TABLE=os.environ['RATE_TABLE']
ALLOWED_TYPES=('data:image/jpeg;base64,','data:image/png;base64,','data:image/webp;base64,')
ddb=boto3.client('dynamodb');secrets=boto3.client('secretsmanager')
DATA=json.loads(Path(__file__).with_name('data.json').read_text(encoding='utf-8'))['master']
ALLOWED={
 'name':{row[0] for row in DATA['pokemon']},
 'item':{row[0] for row in DATA['items']},
 'ability':{row[0] for row in DATA['abilities']},
 'nature':{row[0] for row in DATA['natures']},
 'moves':{row[0] for row in DATA['moves']},
}

SLOT={"type":"object","additionalProperties":False,"required":["slot","name","item","ability","nature","moves","evs","confidence","notes"],"properties":{"slot":{"type":"integer","minimum":1,"maximum":6},"name":{"type":["string","null"]},"item":{"type":["string","null"]},"ability":{"type":["string","null"]},"nature":{"type":["string","null"]},"moves":{"type":"array","maxItems":4,"items":{"type":"string"}},"evs":{"type":"array","minItems":6,"maxItems":6,"items":{"type":["integer","null"],"minimum":0,"maximum":32}},"confidence":{"type":"number","minimum":0,"maximum":1},"notes":{"type":"string"}}}
SLOTS={"type":"array","minItems":6,"maxItems":6,"items":SLOT}
SCHEMA={"oneOf":[{"type":"object","additionalProperties":False,"required":["schemaVersion","kind","slots"],"properties":{"schemaVersion":{"type":"integer","const":1},"kind":{"const":"party"},"slots":SLOTS}},{"type":"object","additionalProperties":False,"required":["schemaVersion","kind","sides"],"properties":{"schemaVersion":{"type":"integer","const":1},"kind":{"const":"lead"},"sides":{"type":"object","additionalProperties":False,"required":["mine","opp"],"properties":{"mine":SLOTS,"opp":SLOTS}}}}]}

def reply(status,body):return {'statusCode':status,'headers':{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},'body':json.dumps(body,ensure_ascii=False)}
def consume_quota():
 day=time.strftime('%Y-%m-%d',time.gmtime());ttl=int(time.time())+172800
 # DynamoDB requires SET to precede ADD when both clauses are present.
 # The previous order raised ValidationException for every request and was
 # surfaced to the browser as the generic 500 response.
 ddb.update_item(TableName=TABLE,Key={'day':{'S':day}},UpdateExpression='SET expiresAt = :ttl ADD requests :one',ConditionExpression='attribute_not_exists(requests) OR requests < :limit',ExpressionAttributeValues={':one':{'N':'1'},':limit':{'N':str(MAX_DAILY)},':ttl':{'N':str(ttl)}})
def output_text(value):
 if isinstance(value.get('output_text'),str):return value['output_text']
 for item in value.get('output',[]):
  for content in item.get('content',[]):
   if content.get('type')=='output_text':return content.get('text','')
 raise ValueError('OpenAI response did not contain output text')
def sanitize(value,kind):
 if value.get('schemaVersion')!=1 or value.get('kind')!=kind:raise ValueError('invalid recognition schema')
 groups=[value.get('slots',[])] if kind=='party' else [value.get('sides',{}).get('mine',[]),value.get('sides',{}).get('opp',[])]
 if any(len(group)!=6 for group in groups):raise ValueError('invalid recognition schema')
 for group in groups:
  for index,slot in enumerate(group):
   slot['slot']=index+1
   for key in ('name','item','ability','nature'):
    if slot.get(key) not in ALLOWED[key]:slot[key]=None
   slot['moves']=[move for move in slot.get('moves',[]) if move in ALLOWED['moves']][:4]
   evs=slot.get('evs',[]);slot['evs']=evs if len(evs)==6 and all(v is None or isinstance(v,int) and 0<=v<=32 for v in evs) else [None]*6
 return value

def handler(event,context):
 try:
  raw=event.get('body') or '{}';raw=base64.b64decode(raw) if event.get('isBase64Encoded') else raw.encode();
  if len(raw)>5_500_000:return reply(413,{'error':'이미지 요청이 너무 큽니다.'})
  body=json.loads(raw);images=body.get('images');kind=body.get('kind','party');mode=body.get('mode','single')
  if kind not in ('party','lead') or mode not in ('single','double') or not isinstance(images,list) or not 1<=len(images)<=4:return reply(400,{'error':'인식 요청 형식이 잘못되었습니다.'})
  for image in images:
   if not isinstance(image,str) or not image.startswith(ALLOWED_TYPES) or len(image)>2_100_000:return reply(413,{'error':'이미지 크기나 형식이 허용 범위를 벗어났습니다.'})
  consume_quota();key=secrets.get_secret_value(SecretId=SECRET_ID)['SecretString']
  prompt=f'포켓몬 챔피언스 {mode} 화면이다. 화면에 보이는 값만 기록하고 추측하지 마라. party는 2열 3행을 위에서 아래, 왼쪽에서 오른쪽 슬롯 1~6으로 읽어 포켓몬명, 도구, 특성, 성격, 기술, HABCDS 배분을 기록한다. lead는 왼쪽 내 파티를 sides.mine, 오른쪽 상대 파티를 sides.opp에 각각 위에서 아래 슬롯 1~6으로 기록하며 포켓몬명만 읽고 나머지는 비운다. 별명만 보이거나 불확실한 값은 null 또는 빈 배열로 남기고 notes에 이유를 적어라.'
  content=[{'type':'input_text','text':prompt}]+[{'type':'input_image','image_url':image,'detail':'high'} for image in images]
  request_body={'model':MODEL,'store':False,'max_output_tokens':1200,'input':[{'role':'user','content':content}],'text':{'format':{'type':'json_schema','name':'champions_screen','strict':True,'schema':SCHEMA}}}
  req=urllib.request.Request('https://api.openai.com/v1/responses',data=json.dumps(request_body).encode(),headers={'authorization':'Bearer '+key,'content-type':'application/json'})
  with urllib.request.urlopen(req,timeout=45) as response:result=json.loads(response.read())
  parsed=sanitize(json.loads(output_text(result)),kind);return reply(200,parsed)
 except ddb.exceptions.ConditionalCheckFailedException:return reply(429,{'error':'오늘 AI 인식 사용 한도에 도달했습니다.'})
 except urllib.error.HTTPError as error:
  detail=error.read().decode(errors='replace');print('OpenAI error',error.code,detail[:500]);return reply(502,{'error':'OpenAI 이미지 인식이 실패했습니다.'})
 except Exception as error:print(type(error).__name__,str(error)[:500]);return reply(500,{'error':'이미지 인식 서버 오류가 발생했습니다.'})
