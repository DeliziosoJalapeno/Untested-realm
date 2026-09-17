# -*- coding: utf-8 -*-
"""Upgrade selected CURIO images from the square art crop (what gen_curios.py caches) to the FULL,
card-shaped photo hosted on the Collector Arthouse curio page.

Only ~16 of the ~60 curios have a full-card photo at all, and many of those are amateur photos
(sleeves / glare / two-card comparison shots) that don't crop cleanly. So this is scoped to a
hand-curated KEEP list of the ones that DO extract cleanly — it never ships a bad auto-crop. For every
other curio the square crop from gen_curios.py stands.

Pipeline per card: scrape the page for the full-res wix media images, detect the card via a colour/brightness
mask + minAreaRect (perspective de-skew), split a two-card comparison shot and keep the foil (more
saturated) half, trim residual background, then write public/cards/curio-<base>.webp (overwriting the crop).

Run: python scripts/gen_curio_fullcards.py   (needs ../sorcery-rag/data/sorcery.db, opencv-python, network)
Re-running is safe; it only touches the KEEP list. Add a base slug to KEEP after eyeballing its result.
"""

import json
import math
import os
import re
import sqlite3
from urllib.request import Request, urlopen

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "packages", "shared", "src", "cards", "cards.json")
OUT_DIR = os.path.join(ROOT, "packages", "client", "public", "cards")
DB = os.path.join(ROOT, "..", "sorcery-rag", "data", "sorcery.db")
WIDTH = 512

# hand-curated: base slugs whose full-card extraction is clean enough to ship (see grids in review).
KEEP = {
    "belfry", "deathspeaker", "dozmary_pool", "entangle_terrain", "gift_of_the_frog",
    "murder_of_crows", "plague_of_frogs", "sorcerer", "wyvern",
}


def get(u):
    return urlopen(Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=90).read()


def order_pts(p):
    r = np.zeros((4, 2), "float32"); s = p.sum(1); d = np.diff(p, axis=1)
    r[0] = p[np.argmin(s)]; r[2] = p[np.argmax(s)]; r[1] = p[np.argmin(d)]; r[3] = p[np.argmax(d)]
    return r


def warp(bgr, pts):
    (tl, tr, br, bl) = pts
    w = int(round(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl))))
    h = int(round(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl))))
    if w < 120 or h < 120:
        return None
    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], "float32")
    return cv2.warpPerspective(bgr, cv2.getPerspectiveTransform(pts, dst), (w, h))


def gauss(x, mu, s):
    return math.exp(-((x - mu) ** 2) / (2 * s * s))


def fit(w, h, prefer):
    r = w / h; port = gauss(r, 0.716, 0.06); land = gauss(r, 1.40, 0.11)
    if prefer == "port":
        return max(port, 0.7 * land)
    if prefer == "land":
        return max(land, 0.7 * port)
    return max(port, land)


def card_mask(sm):
    hsv = cv2.cvtColor(sm, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (0, 30, 45), (180, 255, 255))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((21, 21), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    return m


def inner_trim(wp):
    m = card_mask(wp)
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return wp
    c = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(c) < 0.6 * wp.shape[0] * wp.shape[1]:
        return wp
    x, y, w, h = cv2.boundingRect(c)
    if w * h < 0.98 * wp.shape[0] * wp.shape[1]:
        return wp[y:y + h, x:x + w]
    return wp


def quads(sm):
    A = sm.shape[0] * sm.shape[1]; res = []
    cnts, _ = cv2.findContours(card_mask(sm), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:6]:
        if cv2.contourArea(c) < 0.05 * A:
            continue
        res.append(order_pts(cv2.boxPoints(cv2.minAreaRect(c)).astype("float32")))
    g = cv2.GaussianBlur(cv2.cvtColor(sm, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    e = cv2.dilate(cv2.Canny(g, 25, 110), np.ones((5, 5), np.uint8), 2)
    cnts, _ = cv2.findContours(e, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:12]:
        if cv2.contourArea(c) < 0.05 * A:
            continue
        ap = cv2.approxPolyDP(c, 0.03 * cv2.arcLength(c, True), True)
        if len(ap) == 4 and cv2.isContourConvex(ap):
            res.append(order_pts(ap.reshape(4, 2).astype("float32")))
    return res


def sat_of(img):
    return float(cv2.cvtColor(cv2.resize(img, (64, 64)), cv2.COLOR_BGR2HSV)[:, :, 1].mean())


def candidates(bgr, prefer):
    H, W = bgr.shape[:2]; sc = 1500 / max(H, W)
    sm = cv2.resize(bgr, (int(W * sc), int(H * sc))) if sc < 1 else bgr.copy()
    inv = 1 / sc if sc < 1 else 1; out = []; seen = []
    for q in quads(sm):
        c = q.mean(0)
        if any(np.linalg.norm(c - s) < 40 for s in seen):
            continue
        seen.append(c)
        wp = warp(bgr, q * inv)
        if wp is None:
            continue
        h, w = wp.shape[:2]; subs = [(wp, fit(w, h, prefer))]
        if prefer == "port" and 1.2 < w / h < 1.7:  # two portrait cards captured as one block -> split
            half = w // 2
            for hp in (wp[:, :half], wp[:, half:]):
                subs.append((hp, fit(hp.shape[1], hp.shape[0], prefer)))
        for cand, ff in subs:
            if ff < 0.35:
                continue
            cand = inner_trim(cand); h2, w2 = cand.shape[:2]
            out.append({"wp": cand, "score": w2 * h2 * fit(w2, h2, prefer), "sat": sat_of(cand)})
    wp = inner_trim(bgr); h, w = wp.shape[:2]  # whole image (trimmed): clean tight single-card photos
    if fit(w, h, prefer) >= 0.35:
        out.append({"wp": wp, "score": w * h * fit(w, h, prefer), "sat": sat_of(wp)})
    return out


def main():
    cards = json.load(open(CARDS, encoding="utf-8"))
    namebase, ctype = {}, {}
    for c in cards:
        s = (c.get("img") or "").rsplit("/", 1)[-1].rsplit(".", 1)[0].split("-")
        if len(s) >= 4:
            namebase[c["name"]] = s[1]; ctype[c["name"]] = c.get("type")
    con = sqlite3.connect(DB)
    rows = con.execute("SELECT card_name,page_url FROM curio_art WHERE card_name IS NOT NULL AND page_url IS NOT NULL").fetchall()
    con.close()
    done = 0
    for card_name, page in rows:
        base = namebase.get(card_name)
        if not base or base not in KEEP:
            continue
        prefer = "land" if ctype.get(card_name) == "Site" else "port"
        try:
            html = get(page).decode("utf-8", "ignore")
        except Exception as e:
            print("  PAGE-ERR", card_name, e); continue
        urls = sorted(set(re.findall(r"https://static\.wixstatic\.com/media/d292ab_[A-Za-z0-9]+~mv2\.(?:jpg|jpeg|png|webp)", html)))
        cand = []
        for u in urls:
            try:
                bgr = cv2.imdecode(np.frombuffer(get(u), np.uint8), cv2.IMREAD_COLOR)
            except Exception:
                continue
            if bgr is None or abs(bgr.shape[1] - bgr.shape[0]) / max(bgr.shape[:2]) < 0.12:
                continue  # skip the square crop
            cand += candidates(bgr, prefer)
        if not cand:
            print("  NO-CARD", card_name); continue
        cand.sort(key=lambda d: -d["score"])
        top = [c for c in cand if c["score"] >= 0.75 * cand[0]["score"]]
        pick = max(top, key=lambda d: d["sat"])  # among the biggest, the foil/curio (most saturated)
        wp = pick["wp"]; h, w = wp.shape[:2]
        if w > WIDTH:
            wp = cv2.resize(wp, (WIDTH, int(h * WIDTH / w)), cv2.INTER_AREA)
        cv2.imwrite(os.path.join(OUT_DIR, f"curio-{base}.webp"), wp, [cv2.IMWRITE_WEBP_QUALITY, 84])
        done += 1
        print(f"  OK curio-{base}.webp {wp.shape[1]}x{wp.shape[0]}")
    print(f"done: {done}/{len(KEEP)} full-card curios written")


if __name__ == "__main__":
    main()
