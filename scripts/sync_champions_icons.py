#!/usr/bin/env python3
"""Cache official Pokémon Champions icons and build the visual recognition DB.

The IDs and Korean names come only from the project's verified Champions open
data mapping.  Unknown species are deliberately omitted instead of being
guessed from another game database.
"""

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import os
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
IMPORTER = ROOT / "scripts" / "import_opendata.py"
DATA = ROOT / "dist" / "data.json"
OUT = ROOT / "dist" / "champions-icons"
ICON_MAP = ROOT / "dist" / "champions-icon-map.json"
RECOGNITION_DB = ROOT / "dist" / "recognition-db.json"
BASE = "https://s3-ap-northeast-1.amazonaws.com/pokedb.tokyo/champs/assets/pokemon/icons_128"

# Verified Champions forms needed by current screenshots but not present in the
# downloaded M-4 ranked-team sample yet.
SUPPLEMENTAL = {
    "0733-00": "왕큰부리",
    "0763-00": "달코퀸",
}


def verified_mapping():
    source = IMPORTER.read_text(encoding="utf-8")
    match = re.search(r"pokemon=mapping\('''(.*?)'''\)", source, re.S)
    if not match:
        raise SystemExit("Champions Pokémon ID mapping was not found")
    pairs = dict(line.split("=", 1) for line in match.group(1).strip().splitlines())
    pairs.update(SUPPLEMENTAL)
    current = {
        p["name"]
        for mode in json.loads(DATA.read_text(encoding="utf-8"))["modes"].values()
        for p in mode
    }
    return {pokemon_id: name for pokemon_id, name in pairs.items() if name in current}


def download(item):
    pokemon_id, name = item
    target = OUT / f"pokemon-{pokemon_id}.webp"
    if target.exists() and target.stat().st_size > 500:
        return pokemon_id, name, True
    if os.environ.get("CHAMPIONS_CACHE_ONLY") == "1":
        return pokemon_id, name, False
    url = f"{BASE}/pokemon-{pokemon_id}.webp"
    request = Request(url, headers={"User-Agent": "ChampionsDalkomaBot/16 official-icon-cache"})
    try:
        with urlopen(request, timeout=8) as response:
            content = response.read()
        if len(content) < 500 or content[:4] != b"RIFF" or content[8:12] != b"WEBP":
            return pokemon_id, name, False
        target.write_bytes(content)
        return pokemon_id, name, True
    except (HTTPError, URLError, TimeoutError):
        return pokemon_id, name, False


def main():
    mapping = verified_mapping()
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=20) as pool:
        results = list(pool.map(download, mapping.items()))
    available = {pokemon_id: name for pokemon_id, name, ok in results if ok}
    failed = sorted(name for pokemon_id, name, ok in results if not ok)
    if failed:
        print("Warning: official icons unavailable in this run: " + ", ".join(failed))

    icon_map = {
        name: f"champions-icons/pokemon-{pokemon_id}.webp"
        for pokemon_id, name in sorted(available.items(), key=lambda x: x[1])
    }
    ICON_MAP.write_text(json.dumps(icon_map, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    try:
        previous = json.loads(RECOGNITION_DB.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        previous = {"references": []}
    learned_samples = [
        ref for ref in previous.get("references", [])
        if ref.get("source") in {"사용자 제공 화면", "사용자 제공 챔피언스 화면", "챔피언스 UI"}
        and ref.get("name") in icon_map
    ]
    official = [
        {
            "name": name,
            "variant": "포켓몬 챔피언스 공식 아이콘",
            "src": src,
            "transparent": True,
            "source": "champs.pokedb.tokyo 공식 아이콘",
        }
        for name, src in sorted(icon_map.items())
    ]
    RECOGNITION_DB.write_text(
        json.dumps(
            {
                "schemaVersion": 3,
                "source": "Pokémon Champions official icons only",
                "coverage": len(official),
                "references": official + learned_samples,
            },
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print(f"Cached {len(official)} verified official Champions icons; preserved {len(learned_samples)} screen samples")


if __name__ == "__main__":
    main()
