"""Download every card image once, resize + compress to WebP, and store it in
packages/client/public/cards/<slug>.webp so the app serves images locally.

Idempotent: existing files are skipped. Run again to fill gaps.
"""

import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from urllib.request import urlopen, Request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, 'packages', 'shared', 'src', 'cards', 'cards.json')
PRINTINGS = os.path.join(ROOT, 'packages', 'shared', 'src', 'cards', 'printings.json')
OUT_DIR = os.path.join(ROOT, 'packages', 'client', 'public', 'cards')
CDN = 'https://d27a44hjr9gen3.cloudfront.net/cards'
WIDTH = 512
QUALITY = 80

os.makedirs(OUT_DIR, exist_ok=True)

with open(CARDS, encoding='utf-8') as f:
    cards = json.load(f)

# Site cards are landscape; some printings (promo / alternative arts) ship PORTRAIT (the landscape card
# rotated 90° CCW). Rotate those back so they display the right way up. Curios never reach fetch (skipped
# below), so any portrait SITE image here is such a printing.
SITE_NAMES = {c['name'] for c in cards if c.get('type') == 'Site'}

# (name, cdn-url) for every image we want cached: default front + flip art, PLUS every alternative art
# from printings.json (promo / Gothic / Arthurian / Dragonlord printings the art-picker offers).
wanted = {}  # slug -> (name, url)
for c in cards:
    for url in (c.get('img'), c.get('flipImg')):
        if not url:
            continue
        slug = url.rsplit('/', 1)[-1].rsplit('.', 1)[0]
        wanted.setdefault(slug, (c['name'], url))

if os.path.exists(PRINTINGS):
    with open(PRINTINGS, encoding='utf-8') as f:
        printings = json.load(f)
    for name, arts in printings.items():
        for a in arts:
            slug = a['slug']
            # curios come from Collector Arthouse via scripts/gen_curios.py, NOT the sorcerytcg CDN — skip
            if slug.startswith('curio-'):
                continue
            wanted.setdefault(slug, (name, f'{CDN}/{slug}.png'))

jobs = []
for slug, (name, url) in wanted.items():
    dest = os.path.join(OUT_DIR, slug + '.webp')
    if not os.path.exists(dest):
        jobs.append((name, url, dest))

print(f'{len(jobs)} images to fetch ({len(wanted) - len(jobs)} already cached, {len(wanted)} total)')


def fetch(name, url, dest):
    req = Request(url, headers={'User-Agent': 'sorcery-simulator/0.1 (local cache)'})
    with urlopen(req, timeout=60) as r:
        data = r.read()
    img = Image.open(BytesIO(data))
    if name in SITE_NAMES and img.height > img.width:
        img = img.transpose(Image.ROTATE_270)  # portrait site printing → rotate 90° CW to landscape
    if img.width > WIDTH:
        img = img.resize((WIDTH, int(img.height * WIDTH / img.width)), Image.LANCZOS)
    img.save(dest, 'WEBP', quality=QUALITY)
    return name


ok = 0
failed = []
with ThreadPoolExecutor(max_workers=4) as pool:
    futures = {pool.submit(fetch, *j): j for j in jobs}
    for fut in as_completed(futures):
        name = futures[fut][0]
        try:
            fut.result()
            ok += 1
            if ok % 100 == 0:
                print(f'{ok}/{len(jobs)}', flush=True)
        except Exception as e:
            failed.append((name, str(e)))

print(f'done: {ok} fetched, {len(failed)} failed')
for name, err in failed[:20]:
    print(' FAIL', name, err)
sys.exit(1 if failed else 0)
