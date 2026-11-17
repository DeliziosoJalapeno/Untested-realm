import { validateDeck, findCard } from '../../packages/shared/src'
import '../../packages/shared/src/cards/scripts/index'
import { DECKS } from './decks'
const tot = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0)
for (const [k, d] of Object.entries(DECKS)) {
  const unknown = [...Object.keys(d.spellbook), ...Object.keys(d.atlas), ...Object.keys(d.collection ?? {})].filter((n) => !findCard(n))
  const p = validateDeck(d)
  const th: Record<string, number> = { air: 0, earth: 0, fire: 0, water: 0 }
  for (const [n, c] of Object.entries(d.atlas)) for (const [e, v] of Object.entries(findCard(n)?.thresholds ?? {})) th[e] += (v as number) * c
  console.log(`${k}: spells ${tot(d.spellbook)} sites ${tot(d.atlas)} | site thresholds ${JSON.stringify(th)}${unknown.length ? ' | UNKNOWN ' + unknown.join(', ') : ''}${p.length ? ' | ' + p.map((x) => x.level + ': ' + x.msg).join(' ; ') : ' | legal'}`)
}
