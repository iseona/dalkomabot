"""Synchronise season-usage identities with the local Champions master.

Usage rankings deliberately keep their source spelling.  This command creates
the separate, reviewable identity ledger that turns those IDs into the Korean
master names used by the browser.  Existing Champions catalogue labels win;
PokeAPI is used only for a missing species' dex number, Korean name, types and
base stats.  It never supplies an image.  Run ``sync_champions_display.py``
after this command to cache the matching public Champions images locally.
"""
import argparse, json, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
LEDGER = ROOT / 'sources' / 'season-usage-identities.json'
CACHE = ROOT / '.local-season-usage-identities'
FORM_KEYS = {'squawkabilly':'0931-00', 'squawkabilly-yellow':'0931-02', 'persian-alola':'0053-01',
             'indeedee':'0876-00', 'indeedee-f':'0876-01', 'lycanroc':'0745-00',
             'gourgeist':'0711-00', 'toxtricity':'0849-00', 'toxtricity-low-key':'0849-01',
             'floette-eternal':'0670-05'}
CATALOG_NAMES = {'lycanroc':'루가루암(한낮의 모습)', 'gourgeist':'펌킨인(중과종)',
                 'floette-eternal':'플라엣테(영원의 꽃)'}

def fetch_json(url):
    CACHE.mkdir(exist_ok=True)
    cached = CACHE / (re.sub(r'[^a-z0-9]+', '_', url.lower()).strip('_') + '.json')
    if cached.exists(): return json.loads(cached.read_text(encoding='utf-8'))
    request = urllib.request.Request(url, headers={'User-Agent':'ChampionsPartyLab/1.0 (identity sync)'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if not response.geturl().startswith('https://pokeapi.co/api/v2/'):
            raise ValueError('Unexpected identity source redirect')
        value = json.load(response)
    cached.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    return value

def label(row):
    return (row.get('sourceName',''), row.get('sourceForm',''))

def source_catalog_index(catalog):
    result = {}
    for entry in catalog.get('entries',[]):
        source = entry.get('sourceLabel', {})
        # The source catalog is Japanese too, so this preserves selected forms
        # without guessing from a slug such as rotom-wash.
        key = (source.get('display_name','').replace(' ',''), source.get('form_name','').replace(' ',''))
        if key[0]: result[key] = entry
        # Champions writes regional forms as "name (form)" while Pokemonics
        # sends the same two fields separately.
        match = re.fullmatch(r'(.+?)\((.+)\)', key[0])
        if match: result[(match.group(1), match.group(2))] = entry
    return result

def source_key(row): return tuple(part.replace(' ','') for part in label(row))

def ko_name(species):
    return next((x['name'] for x in species['names'] if x['language']['name']=='ko'), None)

def type_name(value):
    names = fetch_json(value['type']['url'])['names']
    return next(x['name'] for x in names if x['language']['name']=='ko')

def make_master_row(source_id):
    # Pokemonics retains the punctuation used in its own routes; PokeAPI drops
    # the hyphen in the two apostrophe species slugs.
    api_id = {'farfetch-d':'farfetchd', 'sirfetch-d':'sirfetchd', 'gourgeist':'gourgeist-average',
              'indeedee':'indeedee-male', 'toxtricity':'toxtricity-amped',
              'indeedee-f':'indeedee-female', 'basculegion':'basculegion-male', 'meowstic':'meowstic-male',
              'lycanroc':'lycanroc-midday', 'squawkabilly':'squawkabilly-green-plumage',
              'squawkabilly-yellow':'squawkabilly-yellow-plumage',
              'tauros-paldea-aqua':'tauros-paldea-aqua-breed',
              'tauros-paldea-blaze':'tauros-paldea-blaze-breed',
              'tauros-paldea-combat':'tauros-paldea-combat-breed'}.get(source_id, source_id)
    try:
        pokemon = fetch_json(f'https://pokeapi.co/api/v2/pokemon/{api_id}')
    except Exception as error:
        raise ValueError(f'Cannot resolve sourceId {source_id}') from error
    species = fetch_json(pokemon['species']['url'])
    korean = ko_name(species)
    if not korean: raise ValueError(f'No Korean name for {source_id}')
    stats = {item['stat']['name']: item['base_stat'] for item in pokemon['stats']}
    values = [stats[key] for key in ('hp','attack','defense','special-attack','special-defense','speed')]
    types = '/'.join(type_name(value) for value in sorted(pokemon['types'], key=lambda x:x['slot']))
    return [korean, pokemon['name'].replace('-', ' ').title(), types, *map(str,values), str(sum(values))], pokemon, species

def existing_form_entry(source_id, pokemon, catalog):
    """Resolve source-route suffixes where the two Japanese sites name forms differently."""
    species = pokemon['species']['name'].replace('-', ' ')
    candidates = [entry for entry in catalog.get('entries', [])
                  if entry.get('english','').lower().startswith(species.lower())]
    suffix = source_id.removeprefix(pokemon['species']['name']).strip('-')
    words = {'f':'female', 'super':'jumbo', 'large':'large', 'small':'small',
             'low-key':'low', 'paldea-blaze':'blaze', 'paldea-aqua':'aqua',
             'paldea-combat':'combat', 'dusk':'dusk', 'midnight':'midnight'}
    needle = words.get(suffix, suffix.replace('-', ' '))
    matches = [entry for entry in candidates if needle and needle in entry.get('english','').lower()]
    return matches[0] if len(matches)==1 else None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--usage', type=Path, help='Saved import_usage_rankings JSON; avoids a network fetch')
    parser.add_argument('--season', default='M-6')
    args = parser.parse_args()
    if args.usage:
        rankings = json.loads(args.usage.read_text(encoding='utf-8'))
    else:
        sys.path.insert(0, str(ROOT / 'scripts')); from import_usage_rankings import fetch
        rankings = fetch()
    rows = [row for mode in ('single','double') for row in rankings[args.season][mode]['ranking']]
    by_id = {row['sourceId']: row for row in rows}
    data = json.loads((DIST/'data.json').read_text(encoding='utf-8'))
    catalog = json.loads((DIST/'champions-image-catalog.json').read_text(encoding='utf-8'))
    # Early interrupted imports created generic Korean labels for forms already
    # represented by a reviewed Champions catalogue entry.  Canonicalise them
    # before calculating the next delta.
    duplicate_names = {'루가루암','펌킨인','플라엣테'}
    data['master']['pokemon'] = [row for row in data['master']['pokemon'] if row[0] not in duplicate_names]
    catalog_by_name = {entry['name']:entry for entry in catalog.get('entries', [])}
    by_source_label = source_catalog_index(catalog)
    existing = {row[0] for row in data['master']['pokemon']}
    identities, additions = [], []
    for source_id, row in sorted(by_id.items()):
        entry = catalog_by_name.get(CATALOG_NAMES.get(source_id, '')) or by_source_label.get(source_key(row))
        if entry:
            identities.append({'sourceId':source_id, 'name':entry['name'], 'dex':int(entry['key'][:4]), 'form':entry['key'][5:], 'source':label(row)})
            continue
        master, pokemon, species = make_master_row(source_id)
        if master[0] in existing:
            entry = existing_form_entry(source_id, pokemon, catalog)
            if entry:
                identities.append({'sourceId':source_id, 'name':entry['name'], 'dex':int(entry['key'][:4]), 'form':entry['key'][5:], 'source':label(row)})
                continue
            if source_id in FORM_KEYS:
                key = FORM_KEYS[source_id]
                identities.append({'sourceId':source_id, 'name':master[0], 'dex':int(key[:4]), 'form':key[5:], 'source':label(row), 'generatedFrom':'PokeAPI identity metadata'})
                continue
            # The Korean species name is shared by Indeedee's sexes; unlike
            # the public image catalog, PokeAPI does not localise that suffix.
            if source_id == 'indeedee-f':
                master[0] = '에써르(암컷)'
                existing.add(master[0]); additions.append(master)
                identities.append({'sourceId':source_id, 'name':master[0], 'dex':species['id'], 'form':'01', 'source':label(row), 'generatedFrom':'PokeAPI identity metadata'})
                continue
            generated_names = {'persian-alola':'알로라 페르시온', 'squawkabilly-yellow':'시비꼬(옐로깃털)',
                               'toxtricity-low-key':'스트린더(로우한 모습)'}
            if source_id in generated_names:
                master[0] = generated_names[source_id]
                existing.add(master[0]); additions.append(master)
                identities.append({'sourceId':source_id, 'name':master[0], 'dex':species['id'], 'form':'01', 'source':label(row), 'generatedFrom':'PokeAPI identity metadata'})
                continue
            raise ValueError(f'Unresolved form collision for {source_id}: {master[0]}')
        existing.add(master[0]); additions.append(master)
        key = FORM_KEYS.get(source_id, f"{species['id']:04d}-00")
        identities.append({'sourceId':source_id, 'name':master[0], 'dex':int(key[:4]), 'form':key[5:], 'source':label(row), 'generatedFrom':'PokeAPI identity metadata'})
    data['master']['pokemon'].extend(additions)
    # Keep only the site-catalogued Korean labels for these size forms.
    data['master']['pokemon'] = [row for row in data['master']['pokemon'] if row[0] not in duplicate_names]
    data['master']['pokemon'].sort(key=lambda row:(int(row[9]), row[0]))
    (DIST/'data.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',',':')), encoding='utf-8')
    ledger={'schemaVersion':1, 'season':args.season, 'purpose':'Stable source usage ID to local Korean master identity mapping',
            'imagePolicy':'Images are only fetched by sync_champions_display.py from the Champions public catalog.',
            'identities':identities}
    LEDGER.write_text(json.dumps(ledger, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'season':args.season, 'identities':len(identities), 'addedMasterPokemon':len(additions)}, ensure_ascii=False))

if __name__ == '__main__': main()
