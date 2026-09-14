"""Parse Pokemonics' server-rendered cross-season in-game usage ranks.

The source publishes rank, not overall usage percentage. Never relabel the
conditional move/item percentages on individual Pokemon pages as usage rate.
"""
import html,json,re,urllib.request

SOURCE='https://pokemonics.com/usage'
SOURCES=(SOURCE,SOURCE+'/double')

def parse_tables(page):
 text=html.unescape(page.decode('utf-8') if isinstance(page,bytes) else page).replace('\\"','"')
 decoder=json.JSONDecoder();tables=[];cursor=0
 while True:
  cursor=text.find('"table":',cursor)
  if cursor<0:break
  try:value,end=decoder.raw_decode(text,cursor+8)
  except json.JSONDecodeError:cursor+=8;continue
  cursor=end
  if value.get('format') in ('single','double') and value.get('seasons') and value.get('rows'):tables.append(value)
 unique={table['format']:table for table in tables}
 if set(unique)!= {'single','double'}:raise ValueError('Complete single/double usage tables not found')
 return unique

def snapshots(tables):
 seasons={}
 for mode,table in tables.items():
  labels=table['seasons']
  for index,season in enumerate(labels):
   ranking=sorted(({'rank':row['ranks'][index],'sourceId':row['id'],'sourceName':row['name'],'sourceForm':row.get('formName','')} for row in table['rows'] if row['ranks'][index] is not None),key=lambda row:row['rank'])
   seasons.setdefault(season,{})[mode]={'season':season,'metric':'inGameUsageRank','ranking':ranking,'source':SOURCE}
 return seasons

def fetch():
 pages=[]
 for source in SOURCES:
  request=urllib.request.Request(source,headers={'User-Agent':'ChampionsPartyLab/1.0 (daily cached rank import)'})
  with urllib.request.urlopen(request,timeout=30) as response:
   if response.geturl()!=source:raise ValueError('Unexpected usage source redirect')
   body=response.read(2_000_001)
   if len(body)>2_000_000:raise ValueError('Usage source exceeds limit')
   pages.append(body)
 return snapshots(parse_tables(b'\n'.join(pages)))

if __name__=='__main__':print(json.dumps(fetch(),ensure_ascii=False,separators=(',',':')))
