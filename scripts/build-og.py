"""Regenerates public/og.png from live wiki map tiles. Needs Pillow:
       python3 -m pip install Pillow && python3 scripts/build-og.py
Run it only when the art needs refreshing; the PNG is committed."""
import io, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

VERSION = "2026-08-12_a"
ZOOM = -2                      # 1024 game units per 256px tile
BASE = f"https://maps.runescape.wiki/osrs/versions/{VERSION}/tiles/rendered/0/{ZOOM}"
SPAN = 1024                    # game units per tile at this zoom
TARGET = (1200, 630)
# The rendered surface tileset covers this box; anything outside is black.
MAP_X = (768, 4096)
MAP_Y = (1792, 4352)


def fetch(xy):
    x, y = xy
    req = urllib.request.Request(
        f"{BASE}/0_{x}_{y}.png",
        headers={"User-Agent": "TapScape/0.1 (https://github.com/andrewhathaway/TapScape)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            if r.status == 200:
                return x, y, Image.open(io.BytesIO(r.read())).convert("RGB")
    except Exception:
        pass
    return None


tx = range(MAP_X[0] // SPAN, MAP_X[1] // SPAN + 1)
ty = range(MAP_Y[0] // SPAN, MAP_Y[1] // SPAN + 1)
tiles = [t for t in ThreadPoolExecutor(16).map(fetch, [(x, y) for x in tx for y in ty]) if t]
x0, x1 = min(t[0] for t in tiles), max(t[0] for t in tiles)
y0, y1 = min(t[1] for t in tiles), max(t[1] for t in tiles)

world = Image.new("RGB", ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256), (10, 9, 8))
for x, y, img in tiles:
    world.paste(img, ((x - x0) * 256, (y1 - y) * 256))

# Trim to exactly the tiles that carry map, so no black edge survives the crop.
px = SPAN / 256                                   # game units per pixel
left = (MAP_X[0] - x0 * SPAN) / px
right = (MAP_X[1] - x0 * SPAN) / px
top = ((y1 + 1) * SPAN - MAP_Y[1]) / px
bottom = ((y1 + 1) * SPAN - MAP_Y[0]) / px
world = world.crop((round(left), round(top), round(right), round(bottom)))

scale = max(TARGET[0] / world.width, TARGET[1] / world.height)
world = world.resize((round(world.width * scale), round(world.height * scale)), Image.LANCZOS)
# Bias left: the eastern edge of the tileset is empty ocean and reads as a bar.
ox = round((world.width - TARGET[0]) * 0.34)
oy = (world.height - TARGET[1]) // 2
card = world.crop((ox, oy, ox + TARGET[0], oy + TARGET[1]))

card = ImageEnhance.Brightness(card).enhance(0.55)
card = ImageEnhance.Color(card).enhance(0.8)

# Darken the left third so the wordmark has somewhere quiet to sit.
grad = Image.new("L", TARGET, 0)
gd = ImageDraw.Draw(grad)
for i in range(TARGET[0]):
    gd.line([(i, 0), (i, TARGET[1])], fill=int(230 * max(0.0, 1 - (i / (TARGET[0] * 0.72)) ** 1.6)))
card = Image.composite(Image.new("RGB", TARGET, (12, 11, 8)), card, grad)

d = ImageDraw.Draw(card)
F = "/System/Library/Fonts/Supplemental/"
d.text((72, 196), "TapScape", font=ImageFont.truetype(F + "Arial Bold.ttf", 96), fill=(255, 184, 51))
d.text((78, 310), "FIVE OSRS LOCATIONS. ONE MAP. EVERY DAY.",
       font=ImageFont.truetype(F + "Arial Bold.ttf", 33), fill=(240, 230, 210))
d.text((78, 364), "Click where you think each one is — score by how close you land.",
       font=ImageFont.truetype(F + "Arial.ttf", 26), fill=(176, 166, 141))

cx, cy = 92, 452
d.ellipse([cx - 13, cy - 13, cx + 13, cy + 13], fill=(216, 75, 58), outline=(255, 255, 255), width=3)
d.text((cx + 30, cy - 16), "tapscape.andrewhathaway.net",
       font=ImageFont.truetype(F + "Arial.ttf", 26), fill=(205, 195, 170))

card.save("public/og.png", optimize=True)
print("wrote public/og.png", card.size)
