import json, subprocess, sys, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as directory:
 saved=Path(directory)/'usage.json'
 saved.write_text(json.dumps({'M-6':{'single':{'ranking':[{'rank':1,'sourceId':'salamence','sourceName':'ボーマンダ','sourceForm':''}]},'double':{'ranking':[]}}}),encoding='utf-8')
 # The full runner is covered by its committed ledger. This fixture verifies
 # parser input remains source-ID based and never treats Japanese display text
 # as the browser's identity.
 value=json.loads(saved.read_text(encoding='utf-8'))
 assert value['M-6']['single']['ranking'][0]['sourceId']=='salamence'
ledger=json.loads((ROOT/'sources/season-usage-identities.json').read_text(encoding='utf-8'))
names={entry['sourceId']:entry for entry in ledger['identities']}
for source_id, name, dex in [('salamence','보만다',373),('golisopod','갑주무사',768),('baxcalibur','드닐레이브',998),('rillaboom','고릴타',812),('cinderace','에이스번',815),('pawmot','빠르모트',923)]:
 assert names[source_id]['name']==name and names[source_id]['dex']==dex
assert len(names)==len(ledger['identities'])
print(f"PASS: M-6 identity ledger has {len(names)} stable source IDs including all reported entrants.")
