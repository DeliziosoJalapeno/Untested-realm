// What the user owns, as an upper bound per card, from what they told us:
//   - two sets of Frost Mage vs Lavamancer (both precons, twice)
//   - the Gothic precons (one of each)
//   - a full playset of every Arthurian Legends Ordinary and Exceptional
//   - 3 boxes of Beta and 2 boxes of Gothic: assumed 4 of each Ordinary; 3 of each Beta Exceptional and
//     2 of each Gothic Exceptional (about what that many boosters give); Elites and Uniques from boxes are
//     unknown, so they count as 0 here and are listed for the user to confirm.
import { findCard } from '../../packages/shared/src'
import { PRECONS } from '../../packages/shared/src/cards/precons'

const fromPrecons: Record<string, number> = {}
for (const p of PRECONS) {
  const times = p.set === 'Frost Mage vs Lavamancer' ? 2 : p.set === 'Gothic' ? 1 : 0
  if (!times) continue
  for (const m of [p.spellbook, p.atlas, p.collection ?? {}]) for (const [n, c] of Object.entries(m)) fromPrecons[n] = (fromPrecons[n] ?? 0) + c * times
  fromPrecons[p.avatar] = (fromPrecons[p.avatar] ?? 0) + times
}
export function owned(name: string): { n: number; why: string } {
  const c = findCard(name)
  if (!c) return { n: 0, why: 'unknown card' }
  const sets = c.sets as string[]
  let n = fromPrecons[name] ?? 0, why = n ? 'precons' : ''
  const bump = (v: number, w: string) => { if (v > n) { n = v; why = w } else if (v > 0 && fromPrecons[name]) { n = Math.max(n, v) } }
  if (sets.includes('Arthurian Legends') && c.rarity === 'Ordinary') bump(4, 'Arthurian playset')
  if (sets.includes('Arthurian Legends') && c.rarity === 'Exceptional') bump(3, 'Arthurian playset')
  if (sets.includes('Beta') && c.rarity === 'Ordinary') bump(4, 'Beta boxes')
  if (sets.includes('Beta') && c.rarity === 'Exceptional') bump(3, 'Beta boxes (likely)')
  if (sets.includes('Gothic') && c.rarity === 'Ordinary') bump(4, 'Gothic boxes')
  if (sets.includes('Gothic') && c.rarity === 'Exceptional') bump(Math.max(2, fromPrecons[name] ?? 0), 'Gothic boxes (likely 2)')
  return { n, why }
}
