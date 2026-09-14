"""Build small recognition references from locally cached 512px originals."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
data = json.loads((DIST / 'data.json').read_text(encoding='utf-8'))
catalog = json.loads((DIST / 'champions-image-catalog.json').read_text(encoding='utf-8'))
current = {p['name'] for rows in data['modes'].values() for p in rows}
icon_map = json.loads((DIST / 'champions-icon-map.json').read_text(encoding='utf-8'))
for entry in catalog['entries']:
    if entry['name'] not in current:
        continue
    target = DIST / 'champions-icons' / f'pokemon-{entry["key"]}.webp'
    # Preserve existing references so prior training/fixtures remain stable.
    if not target.exists():
        with Image.open(DIST / entry['src']) as image:
            image.convert('RGBA').resize((128, 128), Image.Resampling.LANCZOS).save(target, 'WEBP', lossless=True)
    icon_map[entry['name']] = 'champions-icons/' + target.name
(DIST / 'champions-icon-map.json').write_text(json.dumps(dict(sorted(icon_map.items())), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
database = json.loads((DIST / 'recognition-db.json').read_text(encoding='utf-8'))
preserved = [r for r in database['references'] if r.get('source') in
             {'사용자 제공 화면', '사용자 제공 챔피언스 화면', '챔피언스 UI'}]
references = [{'name': name, 'variant': '포켓몬 챔피언스 아이콘', 'src': src, 'transparent': True,
               'source': 'champs.pokedb.tokyo 공식 아이콘'} for name, src in sorted(icon_map.items())]
database.update(schemaVersion=3, source='Pokémon Champions image references', coverage=len(references), references=references+preserved)
(DIST / 'recognition-db.json').write_text(json.dumps(database, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'Recognition references: {len(icon_map)}/{len(current)} current names; source originals kept at 512px.')
