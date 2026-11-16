// Refresh the Play Sorcery Online statistics snapshot the bots use
// (packages/shared/src/cards/psoStats.json).
//
// PSO's public data API: https://realmdraft.net/analytics-developers — data from Play Sorcery Online
// (https://playsorceryonline.com/). This script follows its "save data on your end" rules:
//   - it asks /releases first and downloads the analytics only when `releasedThrough` has changed
//     (analytics change twice a month — run this at most once a day);
//   - every request sends If-None-Match with the ETag saved from the last run;
//   - the app only ever reads the saved snapshot — no PSO call happens at play time;
//   - on 429 it waits Retry-After once; on 5xx it stops (run it again later).
// The key is personal: it is read from the PSO_API_KEY environment variable (or .env) and never saved.
//
//   PSO_API_KEY=… npx tsx scripts/pso_sync.ts            refresh if there is a new release
//   npx tsx scripts/pso_sync.ts --from <dir>             rebuild from saved raw answers (no network):
//                                                        <dir>/{releases,cards,meta,sites}.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { allCards } from '../packages/shared/src'

const BASE = 'https://playsorceryonline.com/api/v1'
const OUT = resolve(import.meta.dirname, '../packages/shared/src/cards/psoStats.json')
const FORMAT = 'constructed'

interface Rate { playerGames: number | null; winRate: number | null }
interface ApiCard { cardName: string; deckShare: number | null; inDeck: Rate; played: Rate; openingHand: Rate; inHand: Rate; notInHand: Rate }

/** PSO spellings that differ from this app's card names; null = a retired duplicate printing */
const ALIAS: Record<string, string | null> = { 'Pass plug serpent': 'Pass-plug Serpent', 'Reed-cord Measurer': 'Reed Cord Measurer', 'Fireball 2': null, 'Polar Bears 2': null }

const pct = (x: number) => Math.round(x * 1000) / 10
/** shrink a difference toward zero when few games stand behind it */
const shrink = (diff: number, n: number, k: number) => diff * (n / (n + k))

function derive(releases: any, cards: { cards: ApiCard[]; totalGames: number }, meta: any, sites: any, etags: Record<string, string>) {
  const known = new Set(allCards.map((c) => c.name))
  const out: Record<string, { n: number; impact: number; opening: number | null; played: number | null; share: number }> = {}
  const unknown: string[] = []
  for (const c of cards.cards) {
    const name = c.cardName in ALIAS ? ALIAS[c.cardName] : c.cardName
    if (name === null) continue
    if (!known.has(name)) { unknown.push(c.cardName); continue }
    const a = c.inHand.winRate, b = c.notInHand.winRate, n = Math.min(c.inHand.playerGames ?? 0, c.notInHand.playerGames ?? 0)
    if (a === null || b === null || n < 200) continue
    const o = c.openingHand.winRate, d = c.inDeck.winRate, on = c.openingHand.playerGames ?? 0
    out[name] = {
      n,
      // "impact": win rate in games where the card was drawn minus games where it stayed in the deck —
      // the same decks and pilots on both sides, so deck strength cancels out. Percentage points, shrunk.
      impact: Math.round(shrink(pct(a - b), n, 2000) * 10) / 10,
      // "opening": win rate with it in the opening hand minus the deck's overall win rate
      opening: o !== null && d !== null && on >= 200 ? Math.round(shrink(pct(o - d), on, 1500) * 10) / 10 : null,
      played: c.played.winRate !== null ? pct(c.played.winRate) : null,
      share: pct(c.deckShare ?? 0),
    }
  }
  const row = (r: any) => ({ avatars: r.avatarKeys, colors: r.colors, share: pct(r.metaShare), winRate: r.rate.winRate === null ? null : pct(r.rate.winRate), games: r.rate.playerGames })
  return {
    source: 'Play Sorcery Online public data API — https://playsorceryonline.com/',
    format: FORMAT,
    releasedThrough: releases.releasedThrough,
    totalGames: cards.totalGames,
    etags,
    cards: Object.fromEntries(Object.entries(out).sort(([x], [y]) => x.localeCompare(y))),
    meta: {
      avatars: meta.avatars.map(row).sort((x: any, y: any) => y.share - x.share).slice(0, 40),
      combinations: meta.combinations.map(row).filter((r: any) => (r.games ?? 0) >= 300).sort((x: any, y: any) => y.share - x.share).slice(0, 60),
    },
    siteOpenings: sites.openings.filter((o: any) => (o.rate.playerGames ?? 0) >= 400).map((o: any) => ({ offsets: o.offsets, share: pct(o.share), winRate: o.rate.winRate === null ? null : pct(o.rate.winRate), games: o.rate.playerGames })).sort((x: any, y: any) => y.share - x.share),
    _unknownCards: unknown,
  }
}

async function get(path: string, key: string, etag?: string): Promise<{ status: number; body: any; etag: string }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, { headers: { 'x-pso-api-key': key, ...(etag ? { 'If-None-Match': etag } : {}) } })
    if (res.status === 429 && attempt === 0) {
      const wait = Math.min(120, Number(res.headers.get('retry-after') ?? 30))
      console.log(`rate limited — waiting ${wait}s`)
      await new Promise((r) => setTimeout(r, wait * 1000))
      continue
    }
    if (res.status === 304) return { status: 304, body: null, etag: etag ?? '' }
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)} — try again later`)
    return { status: res.status, body: await res.json(), etag: res.headers.get('etag') ?? '' }
  }
}

function loadEnvKey(): string | undefined {
  if (process.env.PSO_API_KEY) return process.env.PSO_API_KEY
  const env = resolve(import.meta.dirname, '../.env')
  if (!existsSync(env)) return undefined
  return /^\s*PSO_API_KEY\s*=\s*(.+?)\s*$/m.exec(readFileSync(env, 'utf8'))?.[1]?.replace(/^(['"])(.*)\1$/, '$2')
}

async function main() {
  const from = process.argv.indexOf('--from')
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null
  let data: ReturnType<typeof derive>
  if (from >= 0) {
    const dir = process.argv[from + 1]
    const read = (n: string) => JSON.parse(readFileSync(join(dir, `${n}.json`), 'utf8'))
    const tag = (n: string) => (existsSync(join(dir, `${n}.hdr`)) ? /^etag:\s*(.+?)\s*$/im.exec(readFileSync(join(dir, `${n}.hdr`), 'utf8'))?.[1] ?? '' : '')
    data = derive(read('releases'), read('cards'), read('meta'), read('sites'), { cards: tag('cards'), meta: tag('meta'), sites: tag('sites') })
  } else {
    const key = loadEnvKey()
    if (!key) throw new Error('Set PSO_API_KEY (environment or .env). Keys: https://realmdraft.net/analytics-developers')
    const rel = await get('/releases', key)
    if (prev && prev.releasedThrough === rel.body.releasedThrough) { console.log(`Up to date (released through ${prev.releasedThrough}). Next release: ${rel.body.nextReleaseAt}.`); return }
    const cards = await get(`/analytics/cards?format=${FORMAT}`, key, prev?.etags?.cards)
    const meta = await get(`/analytics/meta?format=${FORMAT}`, key, prev?.etags?.meta)
    const sites = await get(`/analytics/site-openings?format=${FORMAT}`, key, prev?.etags?.sites)
    if (cards.status === 304 || meta.status === 304 || sites.status === 304) { console.log('The release changed but the data did not (304). Nothing to do.'); return }
    data = derive(rel.body, cards.body, meta.body, sites.body, { cards: cards.etag, meta: meta.etag, sites: sites.etag })
  }
  writeFileSync(OUT, JSON.stringify(data, null, 0).replace(/("[^"]+":\{"n":)/g, '\n$1') + '\n')
  console.log(`Wrote ${Object.keys(data.cards).length} cards (released through ${data.releasedThrough}, ${data.totalGames} games).${data._unknownCards.length ? ` Unknown card names: ${data._unknownCards.join(', ')}` : ''}`)
}
main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1) })
