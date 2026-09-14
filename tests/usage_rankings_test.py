import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('usage',ROOT/'scripts/import_usage_rankings.py');usage=importlib.util.module_from_spec(spec);spec.loader.exec_module(usage)
page=r'''x\"table\":{\"seasons\":[\"M-5\",\"M-6\"],\"baseSeason\":\"M-6\",\"format\":\"single\",\"rows\":[{\"id\":\"salamence\",\"name\":\"ボーマンダ\",\"ranks\":[null,1]},{\"id\":\"garchomp\",\"name\":\"ガブリアス\",\"ranks\":[1,2]}]} y \"table\":{\"seasons\":[\"M-5\",\"M-6\"],\"baseSeason\":\"M-6\",\"format\":\"double\",\"rows\":[{\"id\":\"sneasler\",\"name\":\"オオニューラ\",\"ranks\":[1,1]}]}'''
result=usage.snapshots(usage.parse_tables(page))
assert result['M-6']['single']['ranking'][0]=={'rank':1,'sourceId':'salamence','sourceName':'ボーマンダ','sourceForm':''}
assert result['M-6']['single']['ranking'][1]['sourceId']=='garchomp'
assert result['M-5']['single']['ranking'][0]['sourceId']=='garchomp'
assert result['M-6']['double']['ranking'][0]['sourceId']=='sneasler'
assert result['M-6']['single']['metric']=='inGameUsageRank'
print('PASS: season usage ranks remain separate and M-6 singles starts with Salamence.')
