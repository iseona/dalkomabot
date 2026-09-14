"""Build the compact icon/name legend supplied to the vision model."""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
CELL_WIDTH, CELL_HEIGHT, COLUMNS = 240, 100, 8


def main():
    icon_map = json.loads((DIST / "champions-icon-map.json").read_text(encoding="utf-8"))
    rows = (len(icon_map) + COLUMNS - 1) // COLUMNS
    canvas = Image.new("RGB", (CELL_WIDTH * COLUMNS, CELL_HEIGHT * rows), "white")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 21)
    small = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 16)

    for index, (name, source) in enumerate(sorted(icon_map.items())):
        x = index % COLUMNS * CELL_WIDTH
        y = index // COLUMNS * CELL_HEIGHT
        icon = Image.open(DIST / source).convert("RGBA")
        icon.thumbnail((70, 70), Image.Resampling.LANCZOS)
        canvas.paste(icon, (x + 4, y + 4), icon)
        draw.text((x + 78, y + 15), str(index + 1), fill="#777", font=small)
        draw.text((x + 78, y + 40), name, fill="#111", font=font)
        draw.rectangle((x, y, x + CELL_WIDTH - 1, y + CELL_HEIGHT - 1), outline="#ddd")

    canvas.save(DIST / "pokemon-icon-legend.jpg", quality=88, optimize=True)


if __name__ == "__main__":
    main()
