// Guard: every SITE card must have a locally-cached webp AND it must be LANDSCAPE.
// Sites are played landscape; the CDN serves everything portrait, so the local cache
// (scripts/fetch_images.py + scripts/rotate_sites.py) is what makes sites read correctly.
// A site with no local webp falls back to the portrait CDN image and renders spell-shaped
// (the "Court sites rotated like spells" bug). Run those two scripts to fix a failure here.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const CARDS = join(ROOT, 'packages', 'shared', 'src', 'cards', 'cards.json')
const CARD_DIR = join(ROOT, 'packages', 'client', 'public', 'cards')

function webpSize(path: string): [number, number] | null {
  const b = readFileSync(path)
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null
  const fmt = b.toString('ascii', 12, 16)
  if (fmt === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
  if (fmt === 'VP8L') {
    const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24]
    return [1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))]
  }
  if (fmt === 'VP8X') return [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))]
  return null
}

const cards: any[] = JSON.parse(readFileSync(CARDS, 'utf8'))
const sites = cards.filter((c) => c.type === 'Site' && c.img)

describe('every site card ships a landscape local image', () => {
  it.each(sites.map((c) => [c.name, c.img.split('/').pop().replace(/\.png$/, '.webp')] as const))(
    '%s is cached and landscape',
    (_name, slug) => {
      const path = join(CARD_DIR, slug)
      expect(existsSync(path), `missing local webp ${slug} — run fetch_images.py + rotate_sites.py`).toBe(true)
      const size = webpSize(path)
      expect(size, `unreadable webp ${slug}`).not.toBeNull()
      const [w, h] = size!
      expect(w, `${slug} is portrait (${w}x${h}) — run rotate_sites.py`).toBeGreaterThan(h)
    },
  )
})

// The alternative-art printings of sites (promo / dragonlord) ship PORTRAIT from the CDN and must
// also be rotated to landscape. Curio site art is square (left alone), so it's excluded here.
const PRINTINGS = join(ROOT, 'packages', 'shared', 'src', 'cards', 'printings.json')
const printings: Record<string, { slug: string }[]> = JSON.parse(readFileSync(PRINTINGS, 'utf8'))
const siteNames = new Set(sites.map((c) => c.name))
const sitePrintings = Object.entries(printings)
  .filter(([name]) => siteNames.has(name))
  .flatMap(([name, arts]) => arts.filter((a) => !a.slug.startsWith('curio-')).map((a) => [name, a.slug] as const))

describe('site printings are landscape too', () => {
  it.each(sitePrintings)('%s printing %s is landscape', (_name, slug) => {
    const path = join(CARD_DIR, `${slug}.webp`)
    if (!existsSync(path)) return // printing caching is best-effort; only assert on what we ship
    const size = webpSize(path)
    expect(size, `unreadable webp ${slug}`).not.toBeNull()
    const [w, h] = size!
    expect(w, `${slug} is portrait (${w}x${h}) — run rotate_sites.py`).toBeGreaterThan(h)
  })
})
