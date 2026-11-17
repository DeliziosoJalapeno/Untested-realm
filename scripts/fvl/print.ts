// Print a deck as a list with each card's set and rarity.
import { findCard } from '../../packages/shared/src'
import { DECKS } from './decks'
const NEW = 'Frost Mage vs Lavamancer'
const SHORT: Record<string, string> = { Alpha: 'Alpha', Beta: 'Beta', 'Arthurian Legends': 'Arthurian', Gothic: 'Gothic', [NEW]: 'FvL', Dragonlord: 'Dragonlord', Promotional: 'Promo' }
const setOf = (n: string) => { const s = (findCard(n)?.sets ?? []) as string[]; return s.length === 1 && s[0] === NEW ? 'FvL (new)' : s.filter((x) => x !== 'Promotional').map((x) => SHORT[x] ?? x).join('/') }
for (const key of process.argv.slice(2)) {
  const d = DECKS[key]; if (!d) continue
  console.log(`\n### ${key}  (Avatar: ${d.avatar})`)
  for (const [title, m] of [['Spellbook', d.spellbook], ['Atlas', d.atlas], ['Collection', d.collection ?? {}]] as const) {
    const rows = Object.entries(m).filter(([, c]) => c > 0).map(([n, c]) => ({ n, c, def: findCard(n)! })).sort((a, b) => a.def.type.localeCompare(b.def.type) || (a.def.cost ?? 0) - (b.def.cost ?? 0) || a.n.localeCompare(b.n))
    console.log(`\n**${title} (${rows.reduce((s, r) => s + r.c, 0)})**`)
    let type = ''
    for (const r of rows) { if (title === 'Spellbook' && r.def.type !== type) { type = r.def.type; console.log(`_${type}_`) } console.log(`${r.c} ${r.n} | ${setOf(r.n)} | ${r.def.rarity ?? '-'}`) }
  }
}
