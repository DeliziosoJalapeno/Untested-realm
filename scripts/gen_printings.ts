// Generate packages/shared/src/cards/printings.json — the catalogue of alternative ARTS per card.
//
// api.sorcerytcg.com/api/cards gives every card a `printings[]` list (set + finish). We only care about
// distinct ARTWORKS, so:
//   • the art is identified by the slug's art-code — `<num>-<name>-<ARTCODE>-<finish>` — NOT the set number
//     or the finish. Alpha and Beta share art-code `b`, so they collapse to one entry.
//   • per art-code we keep ONE printing, preferring a Standard finish (`-s`) over Foil/Rainbow — so the
//     picker offers real alternative arts, not shiny duplicates. A promo that only exists as foil is still
//     kept (it's the sole representative of its art).
// Only cards present in our cards.json are emitted, keyed by OUR card name. The card's default art (the
// art-code of its cards.json `img`) is flagged so the picker can mark it.
//
// Run: npx tsx scripts/gen_printings.ts   (needs network)

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CARDS = join(ROOT, 'packages', 'shared', 'src', 'cards', 'cards.json')
const OUT = join(ROOT, 'packages', 'shared', 'src', 'cards', 'printings.json')

interface Printing { slug: string; set: string; artist?: string; default?: boolean }

/** split a card slug into its parts. Names use underscores, so only the num/artcode/finish use dashes:
 *  `999-deathspeaker-op-rf` → { num:'999', art:'op', finish:'rf' }. Robust to a stray dash in the name. */
function parseSlug(slug: string): { num: string; art: string; finish: string } | null {
  const p = slug.split('-')
  if (p.length < 4) return null
  return { num: p[0], finish: p[p.length - 1], art: p[p.length - 2] }
}

async function main() {
  const cards = JSON.parse(readFileSync(CARDS, 'utf-8')) as { name: string; img?: string }[]
  // our card name → default art-code (from cards.json img)
  const defaultArt = new Map<string, string>()
  for (const c of cards) {
    const slug = c.img?.split('/').pop()?.replace(/\.png$/, '')
    const parsed = slug ? parseSlug(slug) : null
    if (parsed) defaultArt.set(c.name, parsed.art)
  }
  const ourNames = new Set(cards.map((c) => c.name))

  console.log('fetching api.sorcerytcg.com/api/cards …')
  const res = await fetch('https://api.sorcerytcg.com/api/cards', { headers: { 'user-agent': 'sorcery-simulator/0.1 (gen)' } })
  if (!res.ok) throw new Error(`api ${res.status}`)
  const apiCards = (await res.json()) as {
    name: string
    printings?: { slug: string; set?: { name?: string }; meta?: { finish?: string; artist?: { name?: string } } }[]
  }[]

  const finishRank = (f?: string) => (f === 'Standard' ? 0 : f === 'Foil' ? 1 : 2) // prefer standard art
  const cardArts = new Map<string, Printing[]>() // every card's arts (incl. single-art) so curios can attach

  for (const c of apiCards) {
    if (!ourNames.has(c.name)) continue
    // group this card's printings by art-code, keeping the best (standard-finish) printing per art
    const byArt = new Map<string, { slug: string; set: string; artist?: string; rank: number }>()
    for (const p of c.printings ?? []) {
      const parsed = parseSlug(p.slug)
      if (!parsed) continue
      const rank = finishRank(p.meta?.finish)
      const cur = byArt.get(parsed.art)
      if (!cur || rank < cur.rank) byArt.set(parsed.art, { slug: p.slug, set: p.set?.name ?? '', artist: p.meta?.artist?.name, rank })
    }
    if (!byArt.size) continue
    const def = defaultArt.get(c.name)
    const arts: Printing[] = [...byArt.entries()]
      .map(([art, v]) => ({ slug: v.slug, set: v.set, artist: v.artist, default: art === def }))
      // default art first, then alphabetically by set for a stable picker order
      .sort((a, b) => (b.default ? 1 : 0) - (a.default ? 1 : 0) || a.set.localeCompare(b.set))
    cardArts.set(c.name, arts)
  }

  // Fold in CURIOS (Collector Arthouse premium art, from scripts/gen_curios.py → curio_art.json). These are
  // a real alternative art the sorcerytcg API doesn't carry; append one to each mapped card as set "Curio".
  const curioPath = join(ROOT, 'packages', 'shared', 'src', 'cards', 'curio_art.json')
  let curioCount = 0
  if (existsSync(curioPath)) {
    const curios = JSON.parse(readFileSync(curioPath, 'utf-8')) as Record<string, { slug: string; artist?: string | null }>
    for (const [name, cu] of Object.entries(curios)) {
      if (!ourNames.has(name) || !cu?.slug) continue
      const arts = cardArts.get(name) ?? (defaultArt.has(name) ? [] : null)
      if (!arts) continue
      if (arts.some((a) => a.slug === cu.slug)) continue
      arts.push({ slug: cu.slug, set: 'Curio', artist: cu.artist ?? undefined, default: false })
      cardArts.set(name, arts)
      curioCount++
    }
  }

  // emit only cards that end up with a CHOICE (more than one art); stable key order for a clean diff
  const out: Record<string, Printing[]> = {}
  for (const [name, arts] of cardArts) if (arts.length > 1) out[name] = arts
  const sorted: Record<string, Printing[]> = {}
  for (const k of Object.keys(out).sort()) sorted[k] = out[k]
  const cardsWithAlts = Object.keys(sorted).length
  writeFileSync(OUT, JSON.stringify(sorted, null, 0) + '\n')
  const slugs = new Set<string>()
  for (const arts of Object.values(sorted)) for (const a of arts) slugs.add(a.slug)
  console.log(`wrote ${OUT}`)
  console.log(`${cardsWithAlts} cards with alternative arts (${curioCount} carry a curio), ${slugs.size} distinct alt-art images`)
}

main().catch((e) => { console.error(e); process.exit(1) })
