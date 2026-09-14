"""AWS Lambda collector: fetch each approved Champions file once, validate, then publish atomically."""
import hashlib,html,json,os,re,shutil,subprocess,sys,tempfile,urllib.request
from concurrent.futures import ThreadPoolExecutor,as_completed
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

def validate_usage_identities(usage, ledger, data, image_map):
 identities={row['sourceId']:row['name'] for row in ledger.get('identities',[])}
 master={row[0] for row in data.get('master',{}).get('pokemon',[])}
 missing=[]
 for season in usage.values():
  for mode in ('single','double'):
   for row in season[mode]['ranking']:
    name=identities.get(row['sourceId'])
    if not name:missing.append(f"{row['sourceId']}:identity")
    elif name not in master:missing.append(f"{row['sourceId']}:master:{name}")
    elif name not in image_map:missing.append(f"{row['sourceId']}:image:{name}")
 if missing:raise ValueError('Usage publication blocked; unresolved identities: '+', '.join(sorted(set(missing))[:20]))
 return identities

def _slug(value):return re.sub(r'[^a-z0-9]+','-',str(value).lower()).strip('-')
def detail_payload(page):
 text=html.unescape(page.decode()).replace('\\"','"');decoder=json.JSONDecoder();cursor=0
 while True:
  cursor=text.find('"data":',cursor)
  if cursor<0:break
  try:value,end=decoder.raw_decode(text,cursor+7)
  except json.JSONDecodeError:cursor+=7;continue
  cursor=end
  if isinstance(value,dict) and all(isinstance(value.get(mode),dict) and 'usage' in value[mode] for mode in ('single','double')):return value
 raise ValueError('Pokemon detail usage payload not found')

def champions_related(page,column,identity_by_form):
 text=html.unescape(page.decode())
 marker=f'pokemon-trend__column-{column}'
 start=text.find(marker)
 if start<0:return []
 end=text.find('pokemon-trend__column-',start+len(marker))
 section=text[start:end if end>=0 else len(text)]
 result=[]
 for source_id in re.findall(r'/pokemon/show/(\d{4}-\d{2})\?',section):
  name=identity_by_form.get(source_id)
  if name and name not in result:result.append(name)
 return result[:10]

def translate_detail(value,mode,season,master,related=None):
 section=value.get(mode,{})
 if section.get('season')!=season or section.get('isFallback') is not False:raise ValueError('Detail season or fallback mismatch')
 usage=section['usage'];excluded=[]
 indexes={key:{_slug(row[1]):row[0] for row in master[key]} for key in ('moves','items','abilities')}
 def entities(key):
  result=[]
  for entry in usage.get(key,[]):
   name=indexes[key].get(_slug(entry.get('id')))
   if name:result.append({'name':name,'rate':entry['pct']})
   else:excluded.append({'category':key,'sourceId':entry.get('id'),'sourceName':entry.get('name')})
  return result
 nature_index={(row[2],row[3]):row[0] for row in master['natures']};natures=[]
 for entry in usage.get('natures',[]):
  key=(entry.get('up') or '(무보정)',entry.get('down') or '(무보정)');name=nature_index.get(key)
  if name:natures.append({'name':name,'rate':entry['pct']})
  else:excluded.append({'category':'natures','sourceName':entry.get('name'),'up':entry.get('up'),'down':entry.get('down')})
 evs=[]
 for group in usage.get('evGroups',[]):
  for entry in group.get('spreads',[]):
   points={letter:int(number) for letter,number in re.findall(r'([HABCDS])(\d+)',entry['spread'])};name=' '.join(letter+str(points.get(letter,0)).zfill(2) for letter in 'HABCDS')
   if sum(points.values())<=66 and all(0<=point<=32 for point in points.values()):evs.append({'name':name,'rate':entry['pct']})
   else:excluded.append({'category':'evs','sourceName':entry['spread']})
 related=related or {}
 return {'moves':entities('moves'),'items':entities('items'),'abilities':entities('abilities'),'natures':natures,'evs':evs,'teammates':related.get('teammates',[]),'defeated':related.get('defeated',[]),'counters':related.get('counters',[])},excluded

def collect_settings(usage,season,master,identity_ledger,limit=None):
 wanted=[]
 for mode in ('single','double'):
  rows=usage[season][mode]['ranking'] if limit is None else usage[season][mode]['ranking'][:limit]
  wanted.extend(row['sourceId'] for row in rows)
 wanted=sorted(set(wanted));pages={};errors=[]
 identity_rows=identity_ledger.get('identities',[])
 source_forms={row['sourceId']:f"{int(row['dex']):04d}-{str(row.get('form','00')).zfill(2)}" for row in identity_rows}
 identity_by_form={value:next((row['name'] for row in identity_rows if row['sourceId']==key),None) for key,value in source_forms.items()}
 def fetch(source_id):
  url=f'https://pokemonics.com/pokemon/{source_id}';request=urllib.request.Request(url,headers={'User-Agent':'ChampionsPartyLab/1.0 (bounded detail import)'})
  with urllib.request.urlopen(request,timeout=12) as response:
   if response.geturl()!=url:raise ValueError('Unexpected detail redirect')
   body=response.read(1_000_001)
   if len(body)>1_000_000:raise ValueError('Detail source size exceeds limit')
  relations={}
  champions_id=source_forms[source_id]
  for mode,rule in (('single',0),('double',1)):
   related_url=f'https://champs.pokedb.tokyo/pokemon/show/{champions_id}?season={season.split("-")[1]}&rule={rule}'
   related_request=urllib.request.Request(related_url,headers={'User-Agent':'ChampionsPartyLab/1.0 (bounded related stats import)'})
   with urllib.request.urlopen(related_request,timeout=12) as response:
    if response.geturl()!=related_url:raise ValueError('Unexpected Champions detail redirect')
    related_body=response.read(1_200_001)
    if len(related_body)>1_200_000:raise ValueError('Champions detail source size exceeds limit')
   relations[mode]={'teammates':champions_related(related_body,'same_team',identity_by_form),'defeated':champions_related(related_body,'win_pokemons',identity_by_form),'counters':champions_related(related_body,'lose_pokemons',identity_by_form)}
  return detail_payload(body),relations
 with ThreadPoolExecutor(max_workers=6) as pool:
  futures={pool.submit(fetch,source_id):source_id for source_id in wanted}
  for future in as_completed(futures):
   source_id=futures[future]
   try:pages[source_id]=future.result()
   except Exception as error:errors.append({'sourceId':source_id,'reason':type(error).__name__})
 output={mode:{} for mode in ('single','double')};excluded=[]
 for source_id,(value,relations) in pages.items():
  for mode in ('single','double'):
   try:output[mode][source_id],missed=translate_detail(value,mode,season,master,relations[mode]);excluded.extend({'sourceId':source_id,'mode':mode,**row} for row in missed)
   except Exception as error:errors.append({'sourceId':source_id,'mode':mode,'reason':str(error)})
 expected={mode:{row['sourceId'] for row in (usage[season][mode]['ranking'] if limit is None else usage[season][mode]['ranking'][:limit])} for mode in ('single','double')}
 missing={mode:sorted(expected[mode]-set(output[mode])) for mode in ('single','double')}
 audit={'requestedSpecies':len(wanted),'fetchedSpecies':len(pages),'failedSpecies':len(wanted)-len(pages),'failedDetails':len(errors),'missingTopDetails':missing,'excludedEntities':len(excluded),'errors':errors,'excluded':excluded}
 return output,audit

def attach_teammates(settings,published,identity_ledger):
 name_to_source={row['name']:row['sourceId'] for row in identity_ledger.get('identities',[])}
 for mode in ('single','double'):
  counts={}
  for team in published['modes'][mode].get('teams',[]):
   names=list(dict.fromkeys(member.get('name') for member in team.get('team',[]) if member.get('name')))
   for name in names:
    bucket=counts.setdefault(name,{})
    for mate in names:
     if mate!=name:bucket[mate]=bucket.get(mate,0)+1
  for name,mates in counts.items():
   source_id=name_to_source.get(name)
   if source_id in settings[mode] and not settings[mode][source_id]['teammates']:settings[mode][source_id]['teammates']=[mate for mate,_ in sorted(mates.items(),key=lambda row:(-row[1],row[0]))[:10]]

def handler(event,context):
 import boto3
 bucket=os.environ['DATA_BUCKET'];s3=boto3.client('s3')
 with tempfile.TemporaryDirectory() as td:
  root=Path(td);(root/'sources').mkdir();(root/'dist').mkdir()
  package=Path(__file__).parent
  shutil.copy(package/'data.json',root/'dist/data.json')
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
  usage=usage_snapshots(b'\n'.join(usage_pages));master_data=json.loads((package/'data.json').read_text(encoding='utf-8'))
  # pokemonics can temporarily expose an older season than the already-published
  # catalogue. Keep the newer ranking snapshot so detail refreshes never regress
  # to the older season and blank its teammate/matchup sections.
  try:
   prior_index=json.loads(s3.get_object(Bucket=bucket,Key='seasons/index.json')['Body'].read())
   prior_latest=prior_index.get('latest')
   if prior_latest and int(prior_latest.split('-')[1])>max(int(value.split('-')[1]) for value in usage):
    restored={}
    for mode in ('single','double'):
     key=next(row['modes'][mode] for row in prior_index.get('seasons',[]) if row.get('season')==prior_latest)
     restored[mode]=json.loads(s3.get_object(Bucket=bucket,Key=key)['Body'].read()).get('usageRanking',[])
    if all(restored.values()):usage[prior_latest]=restored
  except Exception:
   pass
  identity_ledger=json.loads((package/'season-usage-identities.json').read_text(encoding='utf-8'))
  validate_usage_identities(usage,identity_ledger,master_data,json.loads((package/'champions-image-map.json').read_text(encoding='utf-8')))
  latest_usage=max(usage,key=lambda value:int(value.split('-')[1]));settings,settings_audit=collect_settings(usage,latest_usage,master_data['master'],identity_ledger)
  if settings_audit['fetchedSpecies']!=settings_audit['requestedSpecies'] or any(settings_audit['missingTopDetails'].values()):raise ValueError('Top usage detail gate failed: '+json.dumps(settings_audit,ensure_ascii=False))
  env=dict(os.environ,CHAMPIONS_ROOT=str(root))
  subprocess.run([sys.executable,str(Path(__file__).with_name('import_opendata.py'))],env=env,check=True,capture_output=True,timeout=30)
  data=(root/'dist/opendata.json').read_bytes()
  published=json.loads(data)
  if published['modes']['single']['season']==latest_usage:attach_teammates(settings,published,identity_ledger)
  metadata={mode:published['modes'][mode]['metadata'] for mode in ['single','double']}
  digest=hashlib.sha256(data).hexdigest()
  # Versioned mode objects are written first. The index is the atomic commit
  # point, so a partial failure leaves the previous season catalogue usable.
  season_name=f'M-{season}';snapshot_keys={}
  all_seasons=sorted(usage,key=lambda value:int(value.split('-')[1]))
  latest_usage=all_seasons[-1]
  for saved_season in all_seasons:
   for mode in ('single','double'):
    current_settings=settings.get(mode,{}) if saved_season==latest_usage else {}
    snapshot={'schemaVersion':1,'season':saved_season,'mode':mode,'usageRanking':usage[saved_season][mode],'settings':{'status':'available' if current_settings else 'unavailable','season':saved_season,'bySourceId':current_settings,'audit':settings_audit} if saved_season==latest_usage else {'status':'unavailable','reason':'No validated same-season settings snapshot'}}
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
  return {'status':'updated','sha256':digest,'season':season_name,'modes':metadata,'settingsAudit':settings_audit}
