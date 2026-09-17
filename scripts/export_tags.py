"""Export the sorcery-rag mechanic-tag taxonomy into the simulator.

Reads:  C:/Users/Roberto/sorcery-rag/data/sorcery.db  (card_tags + cards tables)
Writes: packages/shared/src/cards/tags.json

Shape:
  {
    "taxonomy": [ {"tag","category","count"}, ... ],   # every tag, by frequency
    "cards":    { "Card Name": ["tag", ...], ... }      # per-card flat tag list
  }

Only cards present in the simulator's cards.json are emitted (tokens etc. dropped),
so the client can look up tags by the exact names it already renders.
"""

import json
import os
import sqlite3

DB = r"C:\Users\Roberto\sorcery-rag\data\sorcery.db"
HERE = os.path.dirname(__file__)
CARDS = os.path.join(HERE, "..", "packages", "shared", "src", "cards", "cards.json")
OUT = os.path.join(HERE, "..", "packages", "shared", "src", "cards", "tags.json")


def main():
    with open(CARDS, encoding="utf-8") as f:
        sim_names = {c["name"] for c in json.load(f)}

    db = sqlite3.connect(DB)
    rows = db.execute("SELECT card_name, tag, category FROM card_tags").fetchall()

    cards: dict[str, list[str]] = {}
    counts: dict[str, int] = {}
    category: dict[str, str] = {}
    for name, tag, cat in rows:
        if name not in sim_names:
            continue
        lst = cards.setdefault(name, [])
        if tag not in lst:
            lst.append(tag)
            counts[tag] = counts.get(tag, 0) + 1
            category[tag] = cat

    for lst in cards.values():
        lst.sort()

    taxonomy = [
        {"tag": t, "category": category[t], "count": counts[t]}
        for t in sorted(counts, key=lambda t: (-counts[t], t))
    ]
    out = {"taxonomy": taxonomy, "cards": dict(sorted(cards.items()))}

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {len(cards)} cards, {len(taxonomy)} tags to {os.path.abspath(OUT)}")
    print("top tags:", [t["tag"] for t in taxonomy[:15]])


if __name__ == "__main__":
    main()
