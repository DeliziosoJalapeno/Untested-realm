"""Merge the Frost Mage vs Lavamancer set (released 2026-11-13) into the simulator's cards.json.

Reads:  the official card API, https://api.sorcerytcg.com/api/cards (or a saved copy given as argv[1])
Writes: packages/shared/src/cards/cards.json and the set's tags in tags.json

Idempotent. Run it again after scripts/export_cards.py, which rebuilds cards.json from the older
official dump that predates this set.

- New cards are appended, with the set's CDN image.
- Reprints of released cards gain the set name.
- Fireball and Polar Bears were REVISED by this set: the released card takes the new text, stats and
  printing (its old printings become alternative art via scripts/gen_printings.ts), and the separate
  "Fireball 2" / "Polar Bears 2" spoiler cards are dropped.

The set's cards were first imported from pso-spoiled-custom-cards.json, a Play Sorcery Online export
of the spoilers. That file is legacy now; nothing reads it.
"""

import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.sorcerytcg.com/api/cards"
OUT = os.path.join(ROOT, "packages", "shared", "src", "cards", "cards.json")
CDN = "https://d27a44hjr9gen3.cloudfront.net/cards/{slug}.png"

SET_NAME = "Frost Mage vs Lavamancer"
SET_CODE = "008"
# released cards this set reprints with new rules; their spoilers were imported as "<name> 2"
REVISED = ("Fireball", "Polar Bears")


def clean(text):
    if not text:
        return ""
    return text.replace("\r\n", "\n").replace("\r", "\n").replace(" -- ", " — ").strip()


def load_api():
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            return json.load(f)
    req = urllib.request.Request(API, headers={"user-agent": "sorcery-simulator/0.1 (import)"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def set_printing(card):
    ps = [p for p in card.get("printings") or [] if (p.get("set") or {}).get("code") == SET_CODE]
    ps.sort(key=lambda p: (p.get("meta") or {}).get("finish") != "Standard")
    return ps[0] if ps else None


def entry(card, printing):
    e = card["engine"]
    attack = e.get("attack")
    defence = e.get("defense")
    if defence is None and e.get("type") == "Minion":
        defence = attack  # the API leaves a minion's defence empty: it equals its power
    return {
        "name": card["name"],
        "type": e.get("type"),
        "rarity": e.get("rarity"),
        "cost": e.get("cost"),
        "attack": attack,
        "defence": defence,
        "life": e.get("life"),
        "elements": [x for x in (e.get("elements") or []) if x and x != "None"],
        "subtypes": list(e.get("subtypes") or []),
        "thresholds": {k: e.get(k) or 0 for k in ("air", "earth", "fire", "water")},
        "text": clean(e.get("rules")),
        "sets": [SET_NAME],
        "img": CDN.format(slug=printing["slug"]),
    }


def keep_detail(new, old_text):
    """The API drops a printed damage grid's numbers ("...at affected locations."); the spoiler text
    spelled them out ("...at affected locations: 4 at ..."). Keep the longer text when it only adds that."""
    if old_text and old_text.startswith(new["text"].rstrip(".")) and len(old_text) > len(new["text"]):
        new["text"] = old_text


def main():
    api = load_api()
    with open(OUT, encoding="utf-8") as f:
        cards = json.load(f)
    by_name = {c["name"]: c for c in cards}

    added, refreshed, reprints, revised, errata = [], [], [], [], []
    for card in api:
        printing = set_printing(card)
        if not printing:
            continue
        new = entry(card, printing)
        name = new["name"]
        old = by_name.get(name)
        if name in REVISED:
            spoiler = by_name.pop(f"{name} 2", None)
            if spoiler:
                cards.remove(spoiler)
                keep_detail(new, spoiler["text"])
            keep_detail(new, old["text"] if old and SET_NAME in old["sets"] else None)
            new["sets"] = [s for s in old["sets"] if s != SET_NAME] + [SET_NAME]
            old.clear()
            old.update(new)
            revised.append(name)
        elif old is None:
            cards.append(new)
            by_name[name] = new
            added.append(name)
        elif old.get("sets") == [SET_NAME]:
            keep_detail(new, old["text"])
            old.clear()
            old.update(new)
            refreshed.append(name)
        else:
            if SET_NAME not in old["sets"]:
                old["sets"].append(SET_NAME)
            reprints.append(name)
            # the API carries the current wording; the older dump can lag behind it
            if clean(old["text"]) != new["text"]:
                errata.append((name, old["text"], new["text"]))
                old["text"] = new["text"]

    official = {c["name"] for c in api}
    stale = [c["name"] for c in cards if c.get("sets") == [SET_NAME] and c["name"] not in official]

    # cards.json is checked in with CRLF line endings and no trailing newline
    with open(OUT, "w", encoding="utf-8", newline="\r\n") as f:
        json.dump(cards, f, ensure_ascii=False, indent=0)
    print(f"{len(added)} new, {len(refreshed)} refreshed, {len(reprints)} reprints, revised {revised}; {len(cards)} cards total")
    if added:
        print("new:", ", ".join(added))
    for name, old_text, new_text in errata:
        print(f"reprint text updated, {name}:\n  ours:     {old_text!r}\n  official: {new_text!r}")
    if stale:
        print("NOT in the official set (left as is):", ", ".join(stale))
    tag_set([c for c in cards if SET_NAME in c.get("sets", []) and (c["sets"] == [SET_NAME] or c["name"] in REVISED)])


# ---- deck-builder mechanic tags (tags.json) ----
# The tag taxonomy comes from the sorcery-rag database (scripts/export_tags.py), which doesn't know this
# set's cards. Their base tags (type, set, rarity, element, subtypes, keywords, trigger) are derived
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
    "Polar Bears": ["movement_fx", "evasion"],
    "Fireball": ["projectile", "damage", "mass", "hits_enemy"],
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


def tag_set(spoiled):
    with open(TAGS_OUT, encoding="utf-8") as f:
        tags = json.load(f)
    category = {t["tag"]: t["category"] for t in tags["taxonomy"]}
    category.update(NEW_TAG_CATEGORY)
    for c in spoiled:
        # a revised released card keeps its other sets' tags
        kept = tags["cards"].get(c["name"], []) if c["name"] in REVISED else []
        tags["cards"][c["name"]] = sorted(set(kept + base_tags(c) + EFFECT_TAGS.get(c["name"], [])))
    for name in REVISED:
        tags["cards"].pop(f"{name} 2", None)
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
    print(f"tagged {len(spoiled)} cards of the set")


if __name__ == "__main__":
    main()
