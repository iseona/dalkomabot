"""Fully parse both uploaded listings before allowing recommendations."""
import re,json
from pathlib import Path
root=Path(__file__).resolve().parents[1];source=root/'sources';master={};excluded=[]
sections=re.split(r'^## \d+\. ',(source/'02-master_index.md').read_text(),flags=re.M)[1:]
for key,section in zip(['pokemon','items','abilities','moves','natures'],sections):
 rows=[]
 for line in section.splitlines():
  if not line.startswith('|'):continue
  c=[v.strip() for v in line.strip('|').split('|')]
  if c[0]=='이름' or c[0].startswith(':'):continue
  if re.search('[가-힣]',c[0]) and not re.search('[ぁ-ヿ一-龯]',c[0]):rows.append(c)
  else:excluded.append({'source':'master','category':key,'name':c[0]})
 master[key]=rows
wh={k:{r[0] for r in v} for k,v in master.items()}
aliases={'items':{'リザードナイトＸ':'리자몽나이트X','リザードナイトＹ':'리자몽나이트Y'}}
out={'master':master,'modes':{},'date':'2026-07-14','season':'M-4','source':'pokemon.yodams.com','requestedSource':'https://champs.pokedb.tokyo'}
for mode,file in [('single','03-stats_single.md'),('double','04-stats_double.md')]:
 rows=[]
 for line in (source/file).read_text().splitlines():
  if not re.match(r'\| \d+ \|',line):continue
  c=[v.strip().replace('**','') for v in line.strip('|').split('|')];assert len(c)==11
  row=dict(rank=int(c[0]),name=c[2],types=c[3].split('/'))
  if row['name'] not in wh['pokemon']:excluded.append({'source':mode,'name':row['name']});continue
  for key,i in [('abilities',4),('items',5),('natures',6),('evs',7),('moves',8)]:
   vals=[];pattern=r'(H\d+ A\d+ B\d+ C\d+ D\d+ S\d+)\(([\d.]+)%\)' if key=='evs' else r'([^,]+?)\(([\d.]+)%\)'
   for name,rate in re.findall(pattern,c[i]):
    name=name.strip()
    name=aliases.get(key,{}).get(name,name)
    if key=='evs':
     ns=list(map(int,re.findall(r'\d+',name)));valid=len(ns)==6 and sum(ns)<=66 and max(ns)<=32
    else:valid=name in wh[key]
    if valid:vals.append({'name':name,'rate':float(rate)})
    else:excluded.append({'source':mode,'pokemon':row['name'],'category':key,'name':name})
   row[key]=vals
  row['teammates']=[n.strip() for n in c[9].split(',') if n.strip() in wh['pokemon']]
  row['counters']=[{'name':n.strip(),'rate':float(r),'n':int(num)} for n,r,num in re.findall(r'([^,]+?)\(승률 ([\d.]+)%, n=(\d+)\)',c[10]) if n.strip() in wh['pokemon']]
  rows.append(row)
 out['modes'][mode]=rows
out['excludedCount']=len(excluded)
(root/'dist/data.json').write_text(json.dumps(out,ensure_ascii=False));(source/'quarantine.json').write_text(json.dumps(excluded,ensure_ascii=False,indent=2))
print({k:len(v) for k,v in out['modes'].items()},'quarantined',len(excluded))
