"""Small, bounded OpenAI vision proxy for Champions screenshots."""
import base64,json,os,time,urllib.error,urllib.request
from pathlib import Path
import boto3

MODEL=os.environ.get('OPENAI_MODEL','gpt-5.2')
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
# Structured Outputs does not permit a root-level oneOf.  Keep a single root
# shape for both calls; the unused group is an empty array and sanitize()
# enforces that the requested group contains exactly six slots.
SLOTS={"type":"array","maxItems":6,"items":SLOT}
SCHEMA={"type":"object","additionalProperties":False,"required":["schemaVersion","kind","slots","sides"],"properties":{"schemaVersion":{"type":"integer","enum":[1]},"kind":{"type":"string","enum":["party","lead"]},"slots":SLOTS,"sides":{"type":"object","additionalProperties":False,"required":["mine","opp"],"properties":{"mine":SLOTS,"opp":SLOTS}}}}

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
def build_request(images,prompt):
 content=[{'type':'input_text','text':prompt}]+[{'type':'input_image','image_url':image,'detail':'high'} for image in images]
 return {'model':MODEL,'store':False,'max_output_tokens':1600,'reasoning':{'effort':'none'},'input':[{'role':'user','content':content}],'text':{'verbosity':'low','format':{'type':'json_schema','name':'champions_screen','strict':True,'schema':SCHEMA}}}
def sanitize(value,kind):
 if value.get('schemaVersion')!=1 or value.get('kind')!=kind:raise ValueError('invalid recognition schema')
 groups=[value.get('slots',[])] if kind=='party' else [value.get('sides',{}).get('mine',[]),value.get('sides',{}).get('opp',[])]
 blank=lambda index:{'slot':index+1,'name':None,'item':None,'ability':None,'nature':None,'moves':[],'evs':[None]*6,'confidence':0,'notes':'AI가 이 슬롯을 반환하지 않았습니다.'}
 for group_index,group in enumerate(groups):
  if not isinstance(group,list):group=[]
  group=(group[:6]+[blank(index) for index in range(len(group),6)])
  groups[group_index]=group
  for index,slot in enumerate(group):
   slot['slot']=index+1
   for key in ('name','item','ability','nature'):
    if slot.get(key) not in ALLOWED[key]:slot[key]=None
   slot['moves']=[move for move in slot.get('moves',[]) if move in ALLOWED['moves']][:4]
   evs=slot.get('evs',[]);slot['evs']=evs if len(evs)==6 and all(v is None or isinstance(v,int) and 0<=v<=32 for v in evs) else [None]*6
 if kind=='party':value['slots']=groups[0]
 else:value['sides']={'mine':groups[0],'opp':groups[1]}
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
  prompt=f'''포켓몬 챔피언스 {mode} 화면이다. 반드시 화면의 모든 슬롯을 빠짐없이 검사하라. lead 요청에 이미지가 두 장이면 첫 이미지는 왼쪽 내 파티 패널, 두 번째 이미지는 오른쪽 상대 파티 패널을 확대해 자른 것이다. party 요청 이미지는 같은 파티의 능력·기술·스테이터스 화면에서 카드 영역만 잘라 세로로 합친 비교표일 수 있다. 비교표의 각 구역은 새로운 슬롯이 아니라 같은 위치의 동일한 6마리이므로, 모든 구역의 정보를 합쳐 slots 6개만 반환하라.
포켓몬 이름 칸에는 별명이 표시될 수 있다. 별명을 종명으로 복사하지 말고, 각 슬롯 왼쪽의 포켓몬 초상화·아이콘과 화면 맥락을 보고 공식 한국어 포켓몬 종명을 판별하라. 초상화로도 판별할 수 없을 때만 name을 null로 두고 notes에 이유를 적어라.
응답은 항상 schemaVersion, kind, slots, sides를 모두 포함한다.
party는 화면의 2열 3행을 행 우선 순서(왼쪽 위=1, 오른쪽 위=2, 왼쪽 가운데=3, 오른쪽 가운데=4, 왼쪽 아래=5, 오른쪽 아래=6)로 slots에 기록한다. 각 슬롯에서 포켓몬 공식 종명, 도구, 특성, 성격, 기술, HABCDS 순서의 배분 숫자를 읽고 sides.mine과 sides.opp는 빈 배열로 둔다. 스테이터스 화면에서는 큰 흰색 숫자가 실능력치이고 오른쪽 작은 숫자가 배분값이다. evs에는 오른쪽 작은 배분값 여섯 개만 HABCDS 순서로 기록한다.
lead는 slots를 빈 배열로 두고 왼쪽 내 파티를 sides.mine, 오른쪽 상대 파티를 sides.opp에 각각 위에서 아래 슬롯 1~6으로 기록한다. 포켓몬 초상화·아이콘으로 공식 한국어 종명을 판별하고 나머지 필드는 null 또는 빈 배열로 둔다.
읽을 수 없는 개별 값만 null 또는 빈 배열로 남기고, 다른 슬롯까지 생략하지 마라.'''
  allowed_names=', '.join(sorted(ALLOWED['name']))
  prompt+=f'''\n이미지가 2열 6행 비교표라면 각 행은 독립 슬롯이다. 왼쪽 열은 위에서 아래 1~6, 오른쪽 열도 위에서 아래 1~6이며 행을 옮기거나 앞뒤 슬롯을 섞지 마라.
lead 요청의 마지막 이미지는 공식 아이콘과 공식 한국어 이름을 짝지은 기준표다. 각 슬롯 아이콘을 기준표에서 시각적으로 대조해 같은 아이콘의 이름을 반환하라. 기준표의 행 위치를 슬롯 번호로 해석하지 마라.
name은 반드시 아래 공식 이름 중 하나를 철자 그대로 사용한다. 지역폼과 특수폼을 생략하지 마라. 예를 들어 알로라 나인테일을 나인테일로 줄이지 않는다. 후보에 없거나 확신할 수 없으면 추측하지 말고 null을 반환한다.
공식 이름 목록: {allowed_names}'''
  request_body=build_request(images,prompt)
  req=urllib.request.Request('https://api.openai.com/v1/responses',data=json.dumps(request_body).encode(),headers={'authorization':'Bearer '+key,'content-type':'application/json'})
  # Leave Lambda time to serialize and return an upstream timeout response.
  with urllib.request.urlopen(req,timeout=110) as response:result=json.loads(response.read())
  parsed=sanitize(json.loads(output_text(result)),kind);return reply(200,parsed)
 except ddb.exceptions.ConditionalCheckFailedException:return reply(429,{'error':'오늘 AI 인식 사용 한도에 도달했습니다.'})
 except urllib.error.HTTPError as error:
  detail=error.read().decode(errors='replace');print('OpenAI error',error.code,detail[:500]);return reply(502,{'error':'OpenAI 이미지 인식이 실패했습니다.'})
 except Exception as error:print(type(error).__name__,str(error)[:500]);return reply(500,{'error':'이미지 인식 서버 오류가 발생했습니다.'})
