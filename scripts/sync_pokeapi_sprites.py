#!/usr/bin/env python3
"""Cache exact-form PokeAPI sprites used by the Champions statistics.

Only image assets are read from PokeAPI. Pokémon names, stats, types, moves,
items, abilities, natures, and metagame data continue to come from the
Champions-only project data.
"""

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import unicodedata
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist" / "data.json"
OUT = ROOT / "dist" / "sprites"
MAP = ROOT / "dist" / "sprite-map.json"
SHINY_OUT = ROOT / "dist" / "sprites-shiny"
SHINY_MAP = ROOT / "dist" / "sprite-shiny-map.json"
HOME_OUT = ROOT / "dist" / "sprites-home"
HOME_MAP = ROOT / "dist" / "sprite-home-map.json"
HOME_SHINY_OUT = ROOT / "dist" / "sprites-home-shiny"
HOME_SHINY_MAP = ROOT / "dist" / "sprite-home-shiny-map.json"
API_LIST = "https://pokeapi.co/api/v2/pokemon?limit=5000"

# PokeAPI uses explicit form names for these default-looking Champions labels.
OVERRIDES = {
    "화염레오": "pyroar-male",
    "냐오닉스(수컷)": "meowstic-male",
    "메가냐오닉스": "meowstic-male-mega",
    "킬가르도(실드폼)": "aegislash-shield",
    "펌킨인(중과종)": "gourgeist-average",
    "루가루암(한낮의 모습)": "lycanroc-midday",
    "따라큐": "mimikyu-disguised",
    "모르페코(배부른 모양)": "morpeko-full-belly",
    "대쓰여너(수컷)": "basculegion-male",
    "파밀리쥐": "maushold-family-of-four",
    "돌핀맨(나이브폼)": "palafin-zero",
}

FORM_SUFFIX = {
    "Alolan Form": "alola",
    "Hisuian Form": "hisui",
    "Galarian Form": "galar",
    "Paldean Form (Combat Breed": "paldea-combat-breed",
    "Paldean Form (Blaze Breed": "paldea-blaze-breed",
    "Paldean Form (Aqua Breed": "paldea-aqua-breed",
    "Sunny Form": "sunny",
    "Rainy Form": "rainy",
    "Snowy Form": "snowy",
    "Eternal Flower": "eternal",
    "Female": "female",
    "Blade Forme": "blade",
    "Heat Rotom": "heat",
    "Wash Rotom": "wash",
    "Frost Rotom": "frost",
    "Fan Rotom": "fan",
    "Mow Rotom": "mow",
    "Small Variety": "small",
    "Large Variety": "large",
    "Jumbo Variety": "super",
    "Midnight Form": "midnight",
    "Dusk Form": "dusk",
    "Hangry Mode": "hangry",
    "Hero Form": "hero",
}


def ascii_slug(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def pokeapi_slug(korean: str, english: str) -> str:
    if korean in OVERRIDES:
        return OVERRIDES[korean]
    base_text = english.split(" (")[0]
    base = ascii_slug(base_text)
    form = english[len(base_text):].strip(" ()")
    if not form:
        return base
    if form.startswith("Mega "):
        repeated = ascii_slug(form[5:]).split("-")
        base_parts = base.split("-")
        remainder = repeated[len(base_parts):] if repeated[:len(base_parts)] == base_parts else []
        return base + "-mega" + (("-" + "-".join(remainder)) if remainder else "")
    return base + "-" + FORM_SUFFIX.get(form, ascii_slug(form))


def fetch_json(url: str):
    req = Request(url, headers={"User-Agent": "ChampionsPartyLab/1.0 sprite-cache"})
    with urlopen(req, timeout=60) as response:
        return json.load(response)


def download(task):
    slug, pokemon_id, kind = task
    folders = {
        "normal": (OUT, "pokemon"),
        "shiny": (SHINY_OUT, "pokemon/shiny"),
        "home": (HOME_OUT, "pokemon/other/home"),
        "home-shiny": (HOME_SHINY_OUT, "pokemon/other/home/shiny"),
    }
    output, folder = folders[kind]
    target = output / f"{slug}.png"
    if target.exists() and target.stat().st_size:
        return kind, slug, True
    url = f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/{folder}/{pokemon_id}.png"
    req = Request(url, headers={"User-Agent": "ChampionsPartyLab/1.0 sprite-cache"})
    try:
        with urlopen(req, timeout=60) as response:
            target.write_bytes(response.read())
        return kind, slug, target.stat().st_size > 100
    except (HTTPError, URLError, TimeoutError):
        return kind, slug, False


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    current = {p["name"] for mode in data["modes"].values() for p in mode}
    master = {p[0]: p[1] for p in data["master"]["pokemon"] if p[0] in current}
    resources = fetch_json(API_LIST)["results"]
    ids = {r["name"]: int(r["url"].rstrip("/").rsplit("/", 1)[1]) for r in resources}

    mapping = {}
    missing = []
    for korean, english in sorted(master.items()):
        slug = pokeapi_slug(korean, english)
        if slug not in ids:
            missing.append(f"{korean}: {english} -> {slug}")
            continue
        mapping[korean] = f"sprites/{slug}.png"

    if missing:
        raise SystemExit("Unresolved exact forms:\n" + "\n".join(missing))

    OUT.mkdir(parents=True, exist_ok=True)
    SHINY_OUT.mkdir(parents=True, exist_ok=True)
    HOME_OUT.mkdir(parents=True, exist_ok=True)
    HOME_SHINY_OUT.mkdir(parents=True, exist_ok=True)
    pairs = {(path[8:-4], ids[path[8:-4]]) for path in mapping.values()}
    tasks = {(slug, pokemon_id, kind) for slug, pokemon_id in pairs for kind in ("normal", "shiny", "home", "home-shiny")}
    with ThreadPoolExecutor(max_workers=24) as pool:
        results = list(pool.map(download, tasks))
    available = {(kind, slug) for kind, slug, ok in results if ok}
    MAP.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    shiny_mapping = {name: path.replace("sprites/", "sprites-shiny/") for name, path in mapping.items() if ("shiny", path[8:-4]) in available}
    SHINY_MAP.write_text(json.dumps(shiny_mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    home_mapping = {name: path.replace("sprites/", "sprites-home/") for name, path in mapping.items() if ("home", path[8:-4]) in available}
    HOME_MAP.write_text(json.dumps(home_mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    home_shiny_mapping = {name: path.replace("sprites/", "sprites-home-shiny/") for name, path in mapping.items() if ("home-shiny", path[8:-4]) in available}
    HOME_SHINY_MAP.write_text(json.dumps(home_shiny_mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Cached display-only pixel and high-resolution sprites for {len(mapping)} Champions Pokémon")


if __name__ == "__main__":
    main()
