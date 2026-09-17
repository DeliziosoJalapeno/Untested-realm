"""Export the sorcery-rag raw card dump into the simulator's cards.json.

Reads:  C:/Users/Roberto/sorcery-rag/data/raw/cards.json  (official API dump)
Writes: packages/shared/src/cards/cards.json

Image URLs are built from curiosa.io's CDN:
  https://d27a44hjr9gen3.cloudfront.net/cards/{setnum}-{slug-rest}.png
where the variant slug's set prefix maps to a numeric folder prefix
(verified empirically against the CDN on 2026-07-17).
"""

import json
import os
import re

RAW = r"C:\Users\Roberto\sorcery-rag\data\raw\cards.json"
OUT = os.path.join(os.path.dirname(__file__), "..", "packages", "shared", "src", "cards", "cards.json")

SET_NUM = {"alp": "001", "bet": "002", "art": "004", "dra": "005", "got": "006", "pro": "999"}
CDN = "https://d27a44hjr9gen3.cloudfront.net/cards/{num}-{rest}.png"

# preference order for the displayed printing
SET_ORDER = ["Beta", "Alpha", "Arthurian Legends", "Gothic", "Dragonlord", "Promotional"]


def clean(text):
    if not text:
        return ""
    return text.replace("\r\n", "\n").replace("\r", "\n").strip()


def variant_url(slug):
    prefix, _, rest = slug.partition("-")
    num = SET_NUM.get(prefix)
    if not num or not rest:
        return None
    return CDN.format(num=num, rest=rest)


def pick_image(card):
    """Prefer standard (non-foil) booster printing of the preferred set."""
    best = None  # (set_rank, variant_rank, url)
    for s in card.get("sets") or []:
        try:
            set_rank = SET_ORDER.index(s.get("name"))
        except ValueError:
            set_rank = len(SET_ORDER)
        for v in s.get("variants") or []:
            slug = v.get("slug") or ""
            url = variant_url(slug)
            if not url:
                continue
            finish = (v.get("finish") or "").lower()
            product = (v.get("product") or "").lower()
            vrank = (0 if finish == "standard" else 1) + (0 if product == "booster" else 2)
            key = (set_rank, vrank)
            if best is None or key < best[0]:
                best = (key, url)
    return best[1] if best else None


def main():
    with open(RAW, encoding="utf-8") as f:
        raw = json.load(f)

    out = []
    missing_img = []
    for card in raw:
        g = card.get("guardian") or {}
        th = g.get("thresholds") or {}
        elements = [e.strip() for e in (card.get("elements") or "").split(",") if e.strip() and e.strip() != "None"]
        subtypes = [s.strip() for s in (card.get("subTypes") or "").split(",") if s.strip()]
        sets = [s.get("name") for s in (card.get("sets") or []) if s.get("name")]
        img = pick_image(card)
        if not img:
            missing_img.append(card.get("name"))
        out.append({
            "name": card.get("name", ""),
            "type": g.get("type"),
            "rarity": g.get("rarity"),
            "cost": g.get("cost"),
            "attack": g.get("attack"),
            "defence": g.get("defence"),
            "life": g.get("life"),
            "elements": elements,
            "subtypes": subtypes,
            "thresholds": {
                "air": th.get("air", 0) or 0,
                "earth": th.get("earth", 0) or 0,
                "fire": th.get("fire", 0) or 0,
                "water": th.get("water", 0) or 0,
            },
            "text": clean(g.get("rulesText")),
            "sets": sets,
            "img": img,
        })

    out.sort(key=lambda c: c["name"])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(f"wrote {len(out)} cards to {os.path.abspath(OUT)}")
    if missing_img:
        print(f"{len(missing_img)} cards without image: {missing_img[:10]}")


if __name__ == "__main__":
    main()
