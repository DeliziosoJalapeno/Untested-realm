// Deck statistics for the deck-building screens: the mana curve (minions against other spells), the
// card types, and the threshold requirements next to the sites that provide them.
import { useMemo } from 'react'
import { findCard, type DeckList } from '@sorcery/shared'

const ELEMS = ['air', 'earth', 'fire', 'water'] as const
type Elem = (typeof ELEMS)[number]
const GLYPH: Record<Elem, string> = { air: '🜁', earth: '🜃', fire: '🜂', water: '🜄' }
const NAME: Record<Elem, string> = { air: 'Air', earth: 'Earth', fire: 'Fire', water: 'Water' }
const BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+']
const TYPES = ['Minion', 'Magic', 'Aura', 'Artifact'] as const
export type DeckStatsSection = 'curve' | 'types' | 'thresholds'

/** the numbers behind the panel (exported for tests) */
export function deckStats(deck: DeckList) {
  const minions = new Array(BUCKETS.length).fill(0) as number[]
  const others = new Array(BUCKETS.length).fill(0) as number[]
  const types: Record<string, number> = { Minion: 0, Magic: 0, Aura: 0, Artifact: 0 }
  const need = Object.fromEntries(ELEMS.map((e) => [e, { peak: 0, spells: 0, by: [0, 0, 0] as [number, number, number], sites: 0 }])) as Record<Elem, { peak: number; spells: number; by: [number, number, number]; sites: number }>
  let spells = 0, sites = 0, costSum = 0
  const count = (name: string, copies: number) => {
    const def = findCard(name)
    if (!def || copies <= 0) return
    const th = def.thresholds as unknown as Record<Elem, number>
    if (def.type === 'Site') { // a site PROVIDES threshold
      sites += copies
      for (const e of ELEMS) if ((th?.[e] ?? 0) > 0) need[e].sites += copies * th[e]
      return
    }
    spells += copies
    if (def.type in types) types[def.type] += copies
    const cost = Math.max(0, def.cost ?? 0)
    costSum += cost * copies
    ;(def.type === 'Minion' ? minions : others)[Math.min(cost, BUCKETS.length - 1)] += copies
    for (const e of ELEMS) {
      const t = th?.[e] ?? 0
      if (t <= 0) continue
      need[e].spells += copies
      need[e].peak = Math.max(need[e].peak, t)
      need[e].by[Math.min(t, 3) - 1] += copies
    }
  }
  for (const [n, c] of Object.entries(deck.spellbook)) count(n, c)
  for (const [n, c] of Object.entries(deck.atlas)) count(n, c)
  return { minions, others, types, need, spells, sites, avgCost: spells ? costSum / spells : 0 }
}

export default function DeckStats({ deck, sections = ['curve', 'types', 'thresholds'] }: { deck: DeckList; sections?: DeckStatsSection[] }) {
  const s = useMemo(() => deckStats(deck), [deck])
  if (s.spells + s.sites === 0) return <div className="db-analysis db-analysis-empty">Add cards to see the mana curve, card types and thresholds.</div>
  const curveMax = Math.max(1, ...BUCKETS.map((_, i) => s.minions[i] + s.others[i]))
  const used = ELEMS.filter((e) => s.need[e].spells > 0 || s.need[e].sites > 0)
  const nonMinion = s.spells - s.types.Minion
  return (
    <div className="db-analysis deck-stats">
      {sections.includes('curve') && (
        <div className="da-section">
          <div className="da-title">Mana curve <span className="ds-note">average cost {s.avgCost.toFixed(1)}</span></div>
          <div className="da-curve">
            {BUCKETS.map((b, i) => {
              const n = s.minions[i] + s.others[i]
              return (
                <div key={b} className="da-col" title={`cost ${b}: ${s.minions[i]} minion${s.minions[i] === 1 ? '' : 's'}, ${s.others[i]} other`}>
                  <span className="da-col-n">{n || ''}</span>
                  <span className="ds-stack" style={{ height: `${(n / curveMax) * 100}%` }}>
                    {s.others[i] > 0 && <span className="ds-other" style={{ flex: s.others[i] }} />}
                    {s.minions[i] > 0 && <span className="ds-minion" style={{ flex: s.minions[i] }} />}
                  </span>
                  <span className="da-col-x">{b}</span>
                </div>
              )
            })}
          </div>
          <div className="ds-legend"><span className="ds-key ds-minion" /> minions <span className="ds-key ds-other" /> magic, auras, artifacts</div>
        </div>
      )}

      {sections.includes('types') && (
        <div className="da-section">
          <div className="da-title">Minions against other spells</div>
          <div className="ds-split" title={`${s.types.Minion} minions, ${nonMinion} other spells`}>
            {s.types.Minion > 0 && <span className="ds-minion" style={{ flex: s.types.Minion }}>{s.types.Minion}</span>}
            {nonMinion > 0 && <span className="ds-other" style={{ flex: nonMinion }}>{nonMinion}</span>}
          </div>
          <div className="ds-types">
            {TYPES.map((t) => <span key={t}><b>{s.types[t]}</b> {t === 'Magic' ? 'Magic' : `${t}${s.types[t] === 1 ? '' : 's'}`}</span>)}
            <span><b>{s.sites}</b> Site{s.sites === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}

      {sections.includes('thresholds') && (
        <div className="da-section">
          <div className="da-title">Threshold requirements</div>
          {used.length === 0 ? <div className="ds-note">No spell needs a threshold yet.</div> : (
            <table className="ds-thresholds">
              <thead><tr><th /><th title="The highest threshold any one spell needs">highest</th><th title="Spells that need 1, 2, and 3 or more of this element">spells needing 1 · 2 · 3+</th><th title="Threshold your sites provide">from sites</th></tr></thead>
              <tbody>
                {used.map((e) => {
                  const n = s.need[e]
                  // you can never cast a spell whose threshold your whole atlas can't reach; a thin supply is slow
                  const short = n.spells > 0 && n.sites < n.peak
                  const thin = !short && n.spells > 0 && n.sites < n.peak + 3
                  return (
                    <tr key={e} className={short ? 'ds-short' : thin ? 'ds-thin' : ''} title={short ? `Your sites give only ${n.sites} ${NAME[e]}: a spell here needs ${n.peak}` : thin ? `Only ${n.sites} ${NAME[e]} from sites for a spell that needs ${n.peak}: it will often come late` : ''}>
                      <td className={`da-elem elem-${e}`}>{GLYPH[e]} {NAME[e]}</td>
                      <td>{n.peak || '–'}</td>
                      <td>{n.spells ? `${n.by[0]} · ${n.by[1]} · ${n.by[2]}` : '–'}</td>
                      <td>{n.sites}{short ? ' ⚠' : thin ? ' !' : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
