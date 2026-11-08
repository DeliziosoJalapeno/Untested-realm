"""Merge spoiled (not yet released) cards into the simulator's cards.json.

Reads:  pso-spoiled-custom-cards.json (repo root; a Play Sorcery Online custom-card export)
Writes: packages/shared/src/cards/cards.json

Idempotent: re-running replaces the spoiled entries in place and appends new ones at the end.
Run it again after scripts/export_cards.py, which rebuilds cards.json from the official API dump only.

A spoiled card named "<Existing Name> 2" (Fireball 2, Polar Bears 2) is the upcoming set's new
version of an existing card. Until that set is out, the existing card keeps its current ruling, so
the new version is a SEPARATE card under its own name.

Images point at the export's imageUrl; scripts/fetch_images.py caches them like any other card.
"""

import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "pso-spoiled-custom-cards.json")
OUT = os.path.join(ROOT, "packages", "shared", "src", "cards", "cards.json")

SET_NAME = "Frost Mage vs Lavamancer"


def clean(text):
    if not text:
        return ""
    return text.replace("\r\n", "\n").replace("\r", "\n").strip()


def entry(card):
    e = card["engine"]
    meta = (card.get("printings") or [{}])[0].get("meta") or {}
    return {
        "name": card["name"],
        "type": e.get("type"),
        "rarity": e.get("rarity"),
        "cost": e.get("cost"),
        "attack": e.get("attack"),
        "defence": e.get("defense"),
        "life": e.get("life"),
        "elements": [x for x in (e.get("elements") or []) if x and x != "None"],
        "subtypes": list(e.get("subtypes") or []),
        "thresholds": {k: e.get(k) or 0 for k in ("air", "earth", "fire", "water")},
        "text": clean(e.get("rules")),
        "sets": [SET_NAME],
        "img": meta.get("imageUrl"),
    }


def main():
    with open(SRC, encoding="utf-8") as f:
        spoiled = json.load(f)
    with open(OUT, encoding="utf-8") as f:
        cards = json.load(f)
    by_name = {c["name"]: c for c in cards}

    added, replaced = [], []
    for card in spoiled:
        new = entry(card)
        old = by_name.get(new["name"])
        if old is None:
            cards.append(new)
            by_name[new["name"]] = new
            added.append(new["name"])
        elif SET_NAME in old.get("sets", []):
            old.clear()
            old.update(new)
            replaced.append(new["name"])
        else:
            raise SystemExit(f"{new['name']} already exists as a released card; refusing to overwrite it")

    # cards.json is checked in with CRLF line endings and no trailing newline
    with open(OUT, "w", encoding="utf-8", newline="\r\n") as f:
        json.dump(cards, f, ensure_ascii=False, indent=0)
    print(f"{len(added)} spoiled cards added, {len(replaced)} refreshed; {len(cards)} cards total")
    tag_spoilers([c for c in cards if SET_NAME in c.get("sets", [])])


# ---- deck-builder mechanic tags (tags.json) ----
# The tag taxonomy comes from the sorcery-rag database (scripts/export_tags.py), which doesn't know the
# spoiled cards. Their base tags (type, set, rarity, element, subtypes, keywords, trigger) are derived
# from the card data; the effect tags below are hand-picked from the existing taxonomy.
TAGS_OUT = os.path.join(ROOT, "packages", "shared", "src", "cards", "tags.json")

EFFECT_TAGS = {
    "Frost Mage": ["disable", "pacify", "protect", "affects_minion", "single_target", "targeted", "disruption"],
    "Lavamancer": ["terraform", "move_site", "displace", "damage", "affects_site", "affects_minion", "mass"],
    "Frostbolt": ["projectile", "damage", "disable", "affects_minion", "hits_enemy", "mass", "disruption"],
    "Ground Slam": ["damage", "mass", "affects_site", "affects_minion", "affects_avatar", "hits_enemy"],
    "Smoldering Hollow": ["buff", "damage"],
    "The White Death": ["evasion", "removal"],
    "Aria Wraith": ["destroy", "removal", "affects_artifact", "affects_minion", "mass", "evasion"],
    "Shatter": ["destroy", "removal", "affects_artifact", "affects_minion", "single_target", "targeted"],
    "Scoria": ["ramp"],
    "Tundra": ["ramp"],
    "Lava Elemental": ["damage", "single_target", "targeted"],
    "Frost Elemental": ["disable", "pacify", "single_target", "targeted"],
    "Polar Bears 2": ["movement_fx", "evasion"],
    "Fireball 2": ["projectile", "damage", "mass", "hits_enemy"],
    "Lone Wolf": ["evasion"],
    "Namira Cheetah": [],
    "Southpaw Dyrodor": ["damage", "mass"],
    "Pass-plug Serpent": ["movement_fx"],
    "Snapjaw Raptor": ["evasion"],
    "Flat Realm Society": ["movement_deny", "disruption", "evasion"],
    "Spike Trap": ["trap", "damage", "single_target"],
    "Volcanic Eruption": ["trap", "projectile", "damage", "mass"],
    "Icicle Dome": ["trap", "destroy", "removal", "targeted", "affects_minion"],
    "Springstem Meadow": ["trap", "displace", "movement_fx"],
    "Deep Snow": ["trap", "tap_down", "disruption", "targeted", "affects_minion"],
    "Combusting Busts": ["trap", "damage", "mass"],
    "Sulfur Vents": ["trap", "damage", "mass", "affects_minion"],
    "Avalanche": ["trap", "displace", "disable", "mass", "movement_fx"],
    "Supervolcano": ["trap", "damage", "mass", "removal", "affects_minion"],
    "Trapper's Rest": ["retrigger"],
    "Bouldermaw": ["trap", "damage", "conjure", "mass"],
    "Rite of Eruption": ["damage", "mass", "destroy", "removal", "affects_site"],
    "Stiff-pitch Witch": ["damage", "mass", "banish", "cemetery"],
    "Emberleaf Dryad": ["ramp", "terraform", "affects_site"],
    "Polar Shift": ["move_site", "terraform", "displace", "draw", "card_advantage"],
    "Ash of Effort": ["sacrifice", "draw", "card_advantage", "affects_site"],
}
NEW_TAG_CATEGORY = {SET_NAME.lower(): "set", "trap": "kwx"}
KEYWORD_TAGS = {
    "airborne": "airborne", "burrowing": "burrowing", "submerge": "submerge", "voidwalk": "voidwalk",
    "charge": "charge", "stealth": "stealth", "ward": "ward", "lethal": "lethal", "lance": "lance",
    "immobile": "immobile", "strike first": "strike_first", "ranged": "ranged", "spellcaster": "spellcaster",
    "movement": "movement_bonus",
}


def base_tags(c):
    tags = [c["type"].lower(), SET_NAME.lower()]
    if c.get("rarity"):
        tags.append(c["rarity"].lower())
    tags += [e.lower() for e in c["elements"]] or ["none"]
    tags += [s.lower() for s in c["subtypes"]]
    text = c["text"].lower()
    first = text.split("\n")[0]
    for word, tag in KEYWORD_TAGS.items():
        if re.search(r"\b" + word + r"\b", first):
            tags.append(tag)
    if "genesis" in text:
        tags.append("genesis")
    if re.search(r"(^|\n)tap\b[^\n]*→", text) and c["type"] != "Avatar":
        tags.append("tap_ability")
    return tags


def tag_spoilers(spoiled):
    with open(TAGS_OUT, encoding="utf-8") as f:
        tags = json.load(f)
    category = {t["tag"]: t["category"] for t in tags["taxonomy"]}
    category.update(NEW_TAG_CATEGORY)
    for c in spoiled:
        tags["cards"][c["name"]] = sorted(set(base_tags(c) + EFFECT_TAGS.get(c["name"], [])))
    counts = {}
    for lst in tags["cards"].values():
        for t in lst:
            counts[t] = counts.get(t, 0) + 1
    unknown = sorted(t for t in counts if t not in category)
    if unknown:
        raise SystemExit(f"tags without a category: {unknown}")
    tags["taxonomy"] = [
        {"tag": t, "category": category[t], "count": counts[t]}
        for t in sorted(counts, key=lambda t: (-counts[t], t))
    ]
    tags["cards"] = dict(sorted(tags["cards"].items()))
    with open(TAGS_OUT, "w", encoding="utf-8", newline="") as f:
        json.dump(tags, f, ensure_ascii=False, separators=(",", ":"))
    print(f"tagged {len(spoiled)} spoiled cards")


if __name__ == "__main__":
    main()
