// What the user owns, as an upper bound per card, from what they told us:
//   - two sets of Frost Mage vs Lavamancer (both precons, twice)
//   - the Gothic precons (one of each)
//   - every Ordinary and Exceptional of Arthurian Legends, Beta and Gothic (a full playset: 4 and 3)
//   - the Elites and Uniques they listed on 19 November (one of each), below
import { findCard } from '../../packages/shared/src'
import { PRECONS } from '../../packages/shared/src/cards/precons'

const LISTED = new Set(["Grim Reaper","Lord of the Void","Occult Ritual","Pendulum of Peril","Dome of Osiros","Ring of Morrigan","Captain Baldassare","Aino","Draconian Bonekite","Koschei's Egg","City of Plenty","Young Master Damion","Pied Piper of Hameln","Mephistopheles","Mother Nature","Chorus of Condemnation","Blasted Oak","Highland Princess",
  "Blightstone","Arcade of Bones","Symmetric Suffering","Nadir Seed","Iron Maiden","Black Obelisk","Mix Aer","Lucid Dreamers","Wuthering Heights","Seraphim","Sinister Pond","Sacred Stag","Stagecoach","Purge Juggernaut","Puppet Master","Diluvian Kraken","Payload Trebuchet","Mix Aqua","Undertaker Engine","East-West Dragon","Megamoeba","Vril Revenant","Sky Baron","Pollimorph","Falling Star","Magellan Globe","Devil's Egg","Selfsame Simulacrum","Highland Falconer","Court Jester","Seirawan Hydra","Recurring Specter","Hounds of Ondaros","Chains of Prometheus","Adept Illusionist","Bleeding Skull","Crucifix","Dormant Monstrosity","Black Cat","Hemogoblet","Earl of the Ivory Towers","All-terrain Vestments","Lacuna Entity","Stargazer","Screaming Skull","Maddening Bells","Riddle Sphinx","Nimbus Jinn","Polar Explorers"])
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
  const boxed = sets.some((x) => ['Arthurian Legends', 'Beta', 'Alpha', 'Gothic'].includes(x))
  if (boxed && c.rarity === 'Ordinary') bump(4, 'playset')
  if (boxed && c.rarity === 'Exceptional') bump(3, 'playset')
  if (LISTED.has(name)) { n = Math.max(n, 1); why = why || 'listed' }
  if (name === 'Adept Illusionist') n = Math.max(n, 2) // they have two
  return { n, why }
}
