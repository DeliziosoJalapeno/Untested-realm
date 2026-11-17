import { validateDeck, findCard } from '../../packages/shared/src'
import '../../packages/shared/src/cards/scripts/index'
import { DECKS } from './decks'
const tot = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0)
for (const [k, d] of Object.entries(DECKS)) {
  const unknown = [...Object.keys(d.spellbook), ...Object.keys(d.atlas), ...Object.keys(d.collection ?? {})].filter((n) => !findCard(n))
  const p = validateDeck(d)
  // a competitive list is exactly 60 spells, 30 sites and a 10-card collection
  if (tot(d.spellbook) !== 60 || tot(d.atlas) !== 30 || tot(d.collection ?? {}) !== 10) p.push({ level: 'error', msg: `NOT 60/30/10: ${tot(d.spellbook)}/${tot(d.atlas)}/${tot(d.collection ?? {})}` } as any)
  const th: Record<string, number> = { air: 0, earth: 0, fire: 0, water: 0 }
  for (const [n, c] of Object.entries(d.atlas)) for (const [e, v] of Object.entries(findCard(n)?.thresholds ?? {})) th[e] += (v as number) * c
  console.log(`${k}: spells ${tot(d.spellbook)} sites ${tot(d.atlas)} | site thresholds ${JSON.stringify(th)}${unknown.length ? ' | UNKNOWN ' + unknown.join(', ') : ''}${p.length ? ' | ' + p.map((x) => x.level + ': ' + x.msg).join(' ; ') : ' | legal'}`)
}
