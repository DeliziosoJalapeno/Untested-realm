"""Bring cards.json up to the released Frost Mage vs Lavamancer set (13 Nov 2026).

Reads:  an api.sorcerytcg.com/api/cards dump (path as argv[1])
Writes: packages/shared/src/cards/cards.json

Before the release the simulator carried 36 spoiled cards from a Play Sorcery Online export (see
import_spoilers.py). This replaces them with the official data:
  * adds the set's cards that were never spoiled
  * gives every card of the set its official art
  * applies the released text / stats to the spoiled ones, and tags the set's reprints with the set
  * folds the two stand-ins "Fireball 2" and "Polar Bears 2" into Fireball and Polar Bears: the set is
    out, so the new versions ARE those cards now ("always use the newest text")

Where the printed card and the API disagree, the printed card wins (PRINTED below). Cards whose damage
pattern is a picture on the card get the pattern written out (TEXT below), as the spoiled cards did.
Idempotent.
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packages", "shared", "src", "cards", "cards.json")
API_SET = "Frost Mage Vs. Lavamancer"
SET_NAME = "Frost Mage vs Lavamancer"  # the simulator's tag for the set (deck builder, precon mode)
CDN = "https://d27a44hjr9gen3.cloudfront.net/cards/{slug}.png"

# printed card vs API (checked against the card images, 14 Nov 2026)
PRINTED = {
    "A Yeti So Shy": {"cost": 4},                      # API says 3
    "Reed Cord Measurer": {"rarity": "Exceptional"},   # "An Exceptional Mortal sets the bounds"; API says Ordinary
    "Runeling": {"rarity": "Exceptional"},             # "An Exceptional Mortal, newly etched"; API says Ordinary
    "Nanurluk": {"subtypes": ["Spirit", "Beast"]},     # "A Unique Spirit Beast"; API lists Spirit only
}

# rules text with the card's printed grid written out in words
TEXT = {
    "Fireball": "Shoot a projectile. It explodes on impact, dealing damage to each unit at affected locations: 4 at the location it hits, and 2 at each location orthogonally adjacent to it (plus-shaped pattern).",
    "King Krakalak": "Genesis → Sacrifice this site to deal damage to each other unit at affected sites: 5 at this site, and 3 at each nearby site.",
    "Frost Breath": "May be cast by a Beast or Spirit. Each unit at affected locations takes damage and is disabled until your next turn: 2 at the location in front of the caster, and 1 at the location beyond it and at the locations on either side of it.",
    "Jormungand": "Occupies all outer locations safely, and can't be modified.",
    # the API has the set symbol as "@"; the FAQ spells it out: a Beast with the Alpha set symbol
    "Ancient Thaw": "Genesis → Cast an Alpha Beast from your collection here, disabled until your next turn.",
}
# spoiled cards whose pattern is already written out in cards.json: keep that wording
KEEP_TEXT = {"Rite of Eruption", "Southpaw Dyrodor"}
RETIRED = {"Fireball 2": "Fireball", "Polar Bears 2": "Polar Bears"}


def clean(text):
    return (text or "").replace("\r\n", "\n").replace("\r", "\n").replace(" -- ", " — ").strip()


def main():
    api = json.load(open(sys.argv[1], encoding="utf-8"))
    cards = json.load(open(OUT, encoding="utf-8"))
    cards = [c for c in cards if c["name"] not in RETIRED]
    by_name = {c["name"]: c for c in cards}
    added, updated, tagged = [], [], []

    for card in api:
        mine = [p for p in card["printings"] if p["set"]["name"] == API_SET]
        if not mine:
            continue
        name, e = card["name"], card["engine"]
        only_this_set = all(p["set"]["name"] == API_SET for p in card["printings"])
        cur = by_name.get(name)
        if cur and not only_this_set:
            # a reprint: tag it, and take the released text / stats where they changed
            if SET_NAME not in cur["sets"]:
                cur["sets"].append(SET_NAME)
                tagged.append(name)
            new_text = TEXT.get(name) or clean(e.get("rules"))
            changed = False
            if name in ("Fireball", "Polar Bears", "Coy Nixie", "Hamlet's Ablaze!", "Heat Ray") and cur["text"] != new_text:
                cur["text"] = new_text
                changed = True
            if name == "Polar Bears" and (cur["cost"], cur["attack"], cur["defence"]) != (e["cost"], e["attack"], e["attack"]):
                cur["cost"], cur["attack"], cur["defence"] = e["cost"], e["attack"], e["attack"]
                changed = True
            # the two errata'd reprints show their new printing, so the card image matches the rules in force
            if name in ("Fireball", "Polar Bears") and cur.get("img") != CDN.format(slug=mine[0]["slug"]):
                cur["img"] = CDN.format(slug=mine[0]["slug"])
                changed = True
            if changed:
                updated.append(name)
            continue

        is_unit = e["type"] in ("Minion", "Avatar")
        entry = {
            "name": name,
            "type": e["type"],
            # avatars carry no rarity in cards.json
            "rarity": None if e["type"] == "Avatar" else e.get("rarity"),
            "cost": e.get("cost"),
            "attack": e.get("attack"),
            "defence": e.get("defense") if e.get("defense") is not None else (e.get("attack") if is_unit else None),
            "life": e.get("life") if e["type"] == "Avatar" else None,
            "elements": [x for x in (e.get("elements") or []) if x and x != "None"],
            "subtypes": list(e.get("subtypes") or []),
            "thresholds": {k: e.get(k) or 0 for k in ("air", "earth", "fire", "water")},
            "text": TEXT.get(name) or clean(e.get("rules")),
            "sets": [SET_NAME],
            "img": CDN.format(slug=mine[0]["slug"]),
        }
        entry.update(PRINTED.get(name, {}))
        if cur:
            if name in KEEP_TEXT:
                entry["text"] = cur["text"]
            for k in list(cur.keys()):
                if k not in entry:
                    entry[k] = cur[k]  # simulator-only fields
            if any(cur.get(k) != entry[k] for k in entry):
                updated.append(name)
            cur.clear()
            cur.update(entry)
        else:
            cards.append(entry)
            by_name[name] = entry
            added.append(name)

    # same layout as the file already has (one field per line, CRLF), new cards at the end
    with open(OUT, "w", encoding="utf-8", newline="\r\n") as f:
        json.dump(cards, f, ensure_ascii=False, indent=0)
    print(f"added {len(added)}: {added}")
    print(f"updated {len(updated)}: {updated}")
    print(f"tagged {len(tagged)} reprints with the set")
    print(f"{len(cards)} cards")


if __name__ == "__main__":
    main()
