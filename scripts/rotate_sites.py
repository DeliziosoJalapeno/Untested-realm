"""Rotate cached SITE card images 90 degrees clockwise so they read landscape,
matching how site cards are physically played. Covers BOTH the default art AND the
alternative printings (the promo / dragonlord arts ship portrait — the landscape card
rotated 90 CCW). Curio site art (square) is left alone. Idempotent: only rotates
portrait-oriented files (sites are wider than tall once rotated).
"""

import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, 'packages', 'shared', 'src', 'cards', 'cards.json')
PRINTINGS = os.path.join(ROOT, 'packages', 'shared', 'src', 'cards', 'printings.json')
OUT_DIR = os.path.join(ROOT, 'packages', 'client', 'public', 'cards')

with open(CARDS, encoding='utf-8') as f:
    cards = json.load(f)
site_names = {c['name'] for c in cards if c['type'] == 'Site'}

# every cached image slug that belongs to a SITE card: default art + its printings (minus curios).
slugs = set()
for c in cards:
    if c['name'] in site_names and c.get('img'):
        slugs.add(c['img'].rsplit('/', 1)[-1].rsplit('.', 1)[0])
if os.path.exists(PRINTINGS):
    with open(PRINTINGS, encoding='utf-8') as f:
        printings = json.load(f)
    for name, arts in printings.items():
        if name in site_names:
            for a in arts:
                if not a['slug'].startswith('curio-'):  # curios are square — leave them
                    slugs.add(a['slug'])

rotated = 0
for slug in sorted(slugs):
    path = os.path.join(OUT_DIR, slug + '.webp')
    if not os.path.exists(path):
        continue
    img = Image.open(path)
    if img.height > img.width:  # still portrait → rotate 90° clockwise to landscape
        img.transpose(Image.ROTATE_270).save(path, 'WEBP', quality=80)
        rotated += 1

print(f'rotated {rotated} site images')
