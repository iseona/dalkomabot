"""Personal-use cache of publicly accessible Champions images, no deployment.

One sequential request at a time; existing verified files are reused. Stop on
access/rate-limit responses. PokeAPI's species index supplies only English->dex
identifiers, never images, game stats, moves or recommendations. Every form key
is checked against the requested site's own visible catalog/form labels.
Requires Pillow. Run using the bundled Python runtime.
"""
import hashlib
import json
from pathlib import Path
import re
import time
import unicodedata
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from PIL import Image
from io import BytesIO

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
CACHE = ROOT / '.local-champions-images'
BASE = 'https://champs.pokedb.tokyo'
ASSETS = 'https://s3-ap-northeast-1.amazonaws.com/pokedb.tokyo/champs/assets/pokemon/icons_512'
FORM_WORDS = {
    'Alolan Form': 'アローラ', 'Galarian Form': 'ガラル', 'Hisuian Form': 'ヒスイ',
    'Paldean Form (Combat Breed)': 'コンバット', 'Paldean Form (Blaze Breed)': 'ブレイズ',
    'Paldean Form (Aqua Breed)': 'ウォーター', 'Sunny Form': 'たいよう',
    'Rainy Form': 'あまみず', 'Snowy Form': 'ゆきぐも', 'Eternal Flower': 'えいえん',
    'Female': 'メス', 'Blade Forme': 'ブレード', 'Heat Rotom': 'ヒート',
    'Wash Rotom': 'ウォッシュ', 'Frost Rotom': 'フロスト', 'Fan Rotom': 'スピン',
    'Mow Rotom': 'カット', 'Small Variety': 'こだま', 'Large Variety': 'おおだま',
    'Jumbo Variety': 'ギガだま', 'Midnight Form': 'まよなか', 'Dusk Form': 'たそがれ',
    'Hangry Mode': 'はらぺこ', 'Hero Form': 'マイティ',
}

def request(url, attempt=0):
    time.sleep(.2)
    req = Request(url, headers={'User-Agent': 'DalkombotPersonalImageCache/1.0'})
    try:
        with urlopen(req, timeout=25) as response:
            return response.read()
    except HTTPError as error:
        if error.code in (401, 403, 429):
            raise SystemExit(f'Stopped: server denied/throttled access ({error.code}) at {url}')
        raise
    except (URLError, TimeoutError, ConnectionResetError):
        if attempt >= 2:
            raise
        time.sleep(2 * (attempt+1))
        return request(url, attempt+1)

def cached_json(name, url):
    target = CACHE / name
    if target.exists():
        return json.loads(target.read_text(encoding='utf-8'))
    result = json.loads(request(url))
    target.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    return result

def forms_for(key):
    target = CACHE / f'forms-{key}.json'
    if target.exists():
        return json.loads(target.read_text(encoding='utf-8'))
    html = request(f'{BASE}/pokemon/show/{key}').decode('utf-8')
    match = re.search(r'x-data="pokemonShowBasis\((.*?)\)"', html, re.S)
    if not match:
        raise ValueError(f'No public form metadata: {key}')
    from html import unescape
    data = json.loads(unescape(match.group(1)))
    # Keep image identity only; discard all fetched battle/statistical fields.
    result = [{k: f.get(k, '') for k in ('pokemon_key', 'display_name', 'short_display_name', 'form_name')}
              for f in data['forms'].values()]
    target.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    return result

def text(entry):
    return unicodedata.normalize('NFKC', ' '.join(str(v) for v in entry.values()))

def main():
    CACHE.mkdir(exist_ok=True)
    (DIST / 'champions-images').mkdir(exist_ok=True)
    data = json.loads((DIST / 'data.json').read_text(encoding='utf-8'))
    old_map = json.loads((DIST / 'champions-icon-map.json').read_text(encoding='utf-8'))
    old_keys = {name: Path(src).stem.replace('pokemon-', '') for name, src in old_map.items()}
    # Season rankings can introduce forms which have no recognition icon yet.
    # Their reviewed ledger is the authoritative image identity; never infer a
    # form key from an English display string.
    ledger = ROOT / 'sources' / 'season-usage-identities.json'
    if ledger.exists():
        reviewed_forms = {'squawkabilly':'0931-00', 'squawkabilly-yellow':'0931-02', 'persian-alola':'0053-01',
                          'indeedee':'0876-00', 'indeedee-f':'0876-01', 'lycanroc':'0745-00',
                          'gourgeist':'0711-00', 'toxtricity':'0849-00', 'toxtricity-low-key':'0849-01',
                          'floette-eternal':'0670-05'}
        for identity in json.loads(ledger.read_text(encoding='utf-8')).get('identities', []):
            old_keys[identity['name']] = reviewed_forms.get(identity['sourceId'], f"{identity['dex']:04d}-{identity['form']}")
    species = cached_json('species-identifiers.json', 'https://pokeapi.co/api/v2/pokemon-species?limit=2000')['results']
    dex = {p['name']: int(p['url'].rstrip('/').split('/')[-1]) for p in species}
    source_list = cached_json('site-image-names.json', BASE + '/api/pokemon/search')['pokemons']
    site_by_key = {p['pokemon_key']: p for p in source_list}
    entries, failures = [], []
    for index, row in enumerate(data['master']['pokemon']):
        name, english = row[:2]
        # A reviewed season identity has the exact Champions key, including
        # forms whose PokeAPI English name is not a species slug.
        chosen = site_by_key.get(old_keys.get(name, ''))
        if chosen:
            number = int(chosen['pokemon_key'][:4])
            prefix = f'{number:04d}'
            form = ''
            available = [chosen]
        else:
            base_english = english.split(' (')[0]
            slug = base_english.lower().replace('. ', '-').replace(' ', '-').replace("'", '')
            number = dex.get(slug)
            if not number:
                failures.append({'name': name, 'reason': 'Unmatched species identifier', 'english': english})
                continue
            prefix = f'{number:04d}'
            form = english[len(base_english)+2:-1] if english != base_english else ''
            available = [p for p in source_list if p['pokemon_key'].startswith(prefix + '-')]
        if not chosen and not form:
            chosen = site_by_key.get(prefix + '-00')
        if not chosen and form.startswith('Mega '):
            start = '0670-05' if prefix == '0670' else prefix + '-00'
            available = forms_for(start)
            suffix = re.search(r' ([XYZ])$', form)
            matches = [p for p in available if p.get('form_name', '').startswith('メガ')
                       and (unicodedata.normalize('NFKC', p['display_name']).endswith(suffix[1]) if suffix else not re.search(r'[XYZ](?:\s|$)', text(p)))]
            if len(matches) == 1:
                chosen = matches[0]
        elif not chosen and form:
            word = FORM_WORDS.get(form)
            if word:
                matches = [p for p in available if word in text(p)]
                if len(matches) != 1:
                    available += forms_for(prefix + '-00')
                    matches = list({p['pokemon_key']: p for p in available if word in text(p)}.values())
                if len(matches) == 1:
                    chosen = matches[0]
        if not chosen:
            failures.append({'name': name, 'english': english, 'reason': 'Ambiguous/unmatched form', 'options': available})
            continue
        key = chosen['pokemon_key']
        src = f'champions-images/pokemon-{key}.webp'
        target = DIST / src
        url = f'{ASSETS}/pokemon-{key}.webp'
        try:
            content = target.read_bytes() if target.exists() else request(url)
            with Image.open(BytesIO(content)) as image:
                image.load()
                if image.format != 'WEBP' or image.width != 512 or image.height != 512:
                    raise ValueError(f'Not an original 512px WebP: {image.size}')
                if not target.exists():
                    target.write_bytes(content)
            entries.append({'name': name, 'english': english, 'key': key, 'sourceLabel': chosen,
                            'src': src, 'sourceUrl': url, 'width': 512, 'height': 512,
                            'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
        except HTTPError as error:
            failures.append({'name': name, 'key': key, 'reason': f'HTTP {error.code}'})
        if (index+1) % 20 == 0:
            print(f'Checked {index+1}/{len(data["master"]["pokemon"])}; cached {len(entries)}', flush=True)
    catalog = {'schemaVersion': 1, 'purpose': 'personal local use, not deployed',
               'source': BASE, 'terms': BASE+'/terms', 'entries': entries, 'unresolved': failures}
    (DIST / 'champions-image-catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    image_map = {e['name']: e['src'] for e in entries}
    (DIST / 'champions-image-map.json').write_text(json.dumps(image_map, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'cached': len(entries), 'unresolved': len(failures), 'bytes': sum(e['bytes'] for e in entries)}), flush=True)
    for failure in failures:
        print(json.dumps(failure, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
