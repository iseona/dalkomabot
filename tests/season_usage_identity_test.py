import importlib.util, json, tempfile
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
 usage=value
ledger=json.loads((ROOT/'sources/season-usage-identities.json').read_text(encoding='utf-8'))
names={entry['sourceId']:entry for entry in ledger['identities']}
for source_id, name, dex in [('salamence','보만다',373),('golisopod','갑주무사',768),('baxcalibur','드닐레이브',998),('rillaboom','고릴타',812),('cinderace','에이스번',815),('pawmot','빠르모트',923)]:
 assert names[source_id]['name']==name and names[source_id]['dex']==dex
assert len(names)==len(ledger['identities'])
spec=importlib.util.spec_from_file_location('collector',ROOT/'aws/collector.py');collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
data=json.loads((ROOT/'dist/data.json').read_text(encoding='utf-8'))
images=json.loads((ROOT/'dist/champions-image-map.json').read_text(encoding='utf-8'))
collector.validate_usage_identities(usage,ledger,data,images)
all_usage={'M-6':{mode:{'ranking':[{'rank':rank+1,'sourceId':entry['sourceId']} for rank,entry in enumerate(ledger['identities'])]} for mode in ('single','double')}}
collector.validate_usage_identities(all_usage,ledger,data,images)
broken=json.loads(json.dumps(usage));broken['M-6']['single']['ranking'][0]['sourceId']='future-unmapped-form'
try: collector.validate_usage_identities(broken,ledger,data,images)
except ValueError as error: assert 'publication blocked' in str(error) and 'future-unmapped-form:identity' in str(error)
else: raise AssertionError('Collector must reject an unmapped future-season identity')
print(f"PASS: identity ledger has {len(names)} stable IDs and collector blocks incomplete future seasons.")
