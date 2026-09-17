"""Pull CURIO art (Collector Arthouse images) from the sorcery-rag database, download each into the local
card cache, and emit packages/shared/src/cards/curio_art.json mapping card name -> { slug, artist }.

Curios are a premium alternative art for ~60 cards. sorcerytcg's API doesn't carry them, but the sorcery-rag
project scraped them (curio_art table: card_name, image_url, setname). We give each a `curio-<namebase>` slug
and cache the image at public/cards/<slug>.webp, then gen_printings.ts folds these into printings.json so the
art picker offers "Curio" alongside the sorcerytcg printings.

Run: python scripts/gen_curios.py   (needs ../sorcery-rag/data/sorcery.db, Pillow, network)
"""

import json
import os
import re
import sqlite3
import sys
from io import BytesIO
from urllib.parse import unquote
from urllib.request import Request, urlopen

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "packages", "shared", "src", "cards", "cards.json")
OUT_JSON = os.path.join(ROOT, "packages", "shared", "src", "cards", "curio_art.json")
OUT_DIR = os.path.join(ROOT, "packages", "client", "public", "cards")
DB = os.path.join(ROOT, "..", "sorcery-rag", "data", "sorcery.db")
WIDTH, QUALITY = 512, 82

os.makedirs(OUT_DIR, exist_ok=True)
cards = json.load(open(CARDS, encoding="utf-8"))
# card name -> the name segment of its default slug (002-belfry-b-s -> belfry)
namebase = {}
for c in cards:
    img = c.get("img") or ""
    slug = img.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    parts = slug.split("-")
    if len(parts) >= 4:
        namebase[c["name"]] = parts[1]

if not os.path.exists(DB):
    print(f"ERROR: sorcery-rag db not found at {DB}", file=sys.stderr)
    sys.exit(1)

con = sqlite3.connect(DB)
rows = con.execute(
    "SELECT card_name, image_url FROM curio_art WHERE card_name IS NOT NULL AND image_url IS NOT NULL"
).fetchall()
con.close()


def artist_from_url(url: str) -> str | None:
    # .../Belfry%20Curio%20Drew%20Tucker.jpg -> "Drew Tucker"
    name = unquote(url.rsplit("/", 1)[-1]).rsplit(".", 1)[0]
    m = re.search(r"\bCurio\b\s+(.+)$", name)
    return m.group(1).strip() if m else None


# the raw wix media object (the display filename after /v1/fill/ can be truncated at an apostrophe — e.g.
# "…/Devil's Egg…" — 403ing; the "<hash>~mv2.<ext>" media path is the real, full-res image and always works)
def raw_media(url: str) -> str | None:
    m = re.match(r"(https://static\.wixstatic\.com/media/[^/]+~mv2\.(?:jpg|jpeg|png|webp))", url, re.I)
    return m.group(1) if m else None


def _download(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "sorcery-simulator/0.1 (curio cache)"})
    with urlopen(req, timeout=60) as r:
        return r.read()


def fetch(url: str, dest: str):
    try:
        data = _download(url)
    except Exception:
        raw = raw_media(url)  # retry the full-res media object if the sized/display URL was rejected
        if not raw:
            raise
        data = _download(raw)
    img = Image.open(BytesIO(data)).convert("RGB")
    if img.width > WIDTH:
        img = img.resize((WIDTH, int(img.height * WIDTH / img.width)), Image.LANCZOS)
    img.save(dest, "WEBP", quality=QUALITY)


out: dict[str, dict] = {}
downloaded = skipped = missing = 0
for card_name, url in rows:
    base = namebase.get(card_name)
    if not base:
        missing += 1
        print("  no matching card in db:", card_name)
        continue
    slug = f"curio-{base}"
    out[card_name] = {"slug": slug, "artist": artist_from_url(url)}
    dest = os.path.join(OUT_DIR, slug + ".webp")
    if os.path.exists(dest):
        skipped += 1
        continue
    try:
        fetch(url, dest)
        downloaded += 1
    except Exception as e:
        print("  FAIL", card_name, e)

# stable key order for a clean diff
json.dump({k: out[k] for k in sorted(out)}, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"\ncurios mapped: {len(out)} | images: {downloaded} downloaded, {skipped} cached | unmatched: {missing}")
print(f"wrote {OUT_JSON}")
