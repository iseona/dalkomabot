"""Build small, non-sensitive icon references from accepted screenshots."""

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "recognition"
OUTPUT = ROOT / "dist" / "recognition-screen-icons"

PARTY_CENTERS = [(.119, .280), (.535, .280), (.119, .488), (.535, .488), (.119, .690), (.535, .690)]


def crop(image, center_x, center_y, size):
    width, height = image.size
    pixels = size * height
    box = (
        round(center_x * width - pixels / 2),
        round(center_y * height - pixels / 2),
        round(center_x * width + pixels / 2),
        round(center_y * height + pixels / 2),
    )
    return image.crop(box).resize((96, 96), Image.Resampling.LANCZOS)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))
    references = []
    for filename, sides in manifest["lead"].items():
        image = Image.open(FIXTURES / filename).convert("RGB")
        compact = image.width / image.height < 2.2
        first_y, step_y, size = (.176, .113, .145) if compact else (.202, .119, .135)
        for side, center_x in (("mine", .322), ("opp", .810)):
            for index, name in enumerate(sides[side]):
                if not isinstance(name, str):
                    continue
                target = f"lead-{len(references):02d}.webp"
                crop(image, center_x, first_y + step_y * index, size).save(OUTPUT / target, "WEBP", quality=95)
                references.append({"name": name, "src": f"recognition-screen-icons/{target}", "kind": "lead", "side": side, "fixture": filename})

    for filename in ("party-stats.jpg", "party-ability.jpg"):
        image = Image.open(FIXTURES / filename).convert("RGB")
        for index, (name, (center_x, center_y)) in enumerate(zip(manifest["party"]["names"], PARTY_CENTERS)):
            target = f"party-{filename[6:11]}-{index}.webp"
            crop(image, center_x, center_y, .09).save(OUTPUT / target, "WEBP", quality=95)
            references.append({"name": name, "src": f"recognition-screen-icons/{target}", "kind": "party", "fixture": filename})

    (ROOT / "dist" / "recognition-screen-map.json").write_text(
        json.dumps(references, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
