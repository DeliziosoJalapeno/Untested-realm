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
export type DeckStatsSection = 'summary' | 'curve' | 'types' | 'thresholds'

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

export default function DeckStats({ deck, sections = ['summary', 'curve', 'types', 'thresholds'], layout = 'panel', minSpells, minSites }: {
  deck: DeckList
  sections?: DeckStatsSection[]
  /** 'dashboard': the tiles side by side in one strip; 'panel': stacked in a narrow column */
  layout?: 'dashboard' | 'panel'
  /** the minimum deck size, shown next to the totals (sealed: 24 and 12) */
  minSpells?: number
  minSites?: number
}) {
  const s = useMemo(() => deckStats(deck), [deck])
  const empty = s.spells + s.sites === 0
  if (empty && layout === 'panel') return <div className="db-analysis db-analysis-empty">Add cards to see the mana curve, card types and thresholds.</div>
  const curveMax = Math.max(1, ...BUCKETS.map((_, i) => s.minions[i] + s.others[i]))
  const used = ELEMS.filter((e) => s.need[e].spells > 0 || s.need[e].sites > 0)
  const nonMinion = s.spells - s.types.Minion
  const typeMax = Math.max(1, ...TYPES.map((t) => s.types[t]))
  const thMax = Math.max(1, ...used.map((e) => Math.max(s.need[e].spells, s.need[e].sites)))
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)
  return (
    <div className={`deck-stats ds-${layout}`}>
      {sections.includes('summary') && (
        <div className="ds-tile ds-summary">
          <div className="ds-title">Deck</div>
          <div className="ds-stat"><b>{s.spells}</b>{minSpells ? <i>/ {minSpells}+</i> : null}<span>spells</span></div>
          <div className="ds-stat"><b>{s.sites}</b>{minSites ? <i>/ {minSites}+</i> : null}<span>sites</span></div>
          <div className="ds-stat"><b>{s.spells ? s.avgCost.toFixed(1) : '–'}</b><span>average cost</span></div>
        </div>
      )}

      {sections.includes('curve') && (
        <div className="ds-tile ds-curve-tile">
          <div className="ds-title">Mana curve</div>
          <div className="ds-curve">
            {BUCKETS.map((b, i) => {
              const n = s.minions[i] + s.others[i]
              return (
                <div key={b} className="ds-col" title={`Cost ${b}: ${s.minions[i]} minion${s.minions[i] === 1 ? '' : 's'}, ${s.others[i]} other spell${s.others[i] === 1 ? '' : 's'}`}>
                  <span className="ds-col-n">{n || ''}</span>
                  <span className="ds-stack" style={{ height: `${(n / curveMax) * 100}%` }}>
                    {s.others[i] > 0 && <span className="ds-other" style={{ flex: s.others[i] }} />}
                    {s.minions[i] > 0 && <span className="ds-minion" style={{ flex: s.minions[i] }} />}
                  </span>
                  <span className="ds-col-x">{b}</span>
                </div>
              )
            })}
          </div>
          <div className="ds-legend"><span><i className="ds-key ds-minion" />Minions</span><span><i className="ds-key ds-other" />Other spells</span></div>
        </div>
      )}

      {sections.includes('types') && (
        <div className="ds-tile ds-types-tile">
          <div className="ds-title">Minions and other spells</div>
          <div className="ds-split" title={`${s.types.Minion} minions (${pct(s.types.Minion, s.spells)}%), ${nonMinion} other spells (${pct(nonMinion, s.spells)}%)`}>
            {s.types.Minion > 0 && <span className="ds-minion" style={{ flex: s.types.Minion }} />}
            {nonMinion > 0 && <span className="ds-other" style={{ flex: nonMinion }} />}
          </div>
          <div className="ds-split-labels"><span>{s.types.Minion} minions · {pct(s.types.Minion, s.spells)}%</span><span>{nonMinion} other · {pct(nonMinion, s.spells)}%</span></div>
          <div className="ds-rows">
            {TYPES.map((t) => (
              <div key={t} className="ds-row" title={`${s.types[t]} ${t}`}>
                <span className="ds-row-label">{t === 'Magic' ? 'Magic' : `${t}s`}</span>
                <span className="ds-track"><span className={t === 'Minion' ? 'ds-minion' : 'ds-other'} style={{ width: `${(s.types[t] / typeMax) * 100}%` }} /></span>
                <span className="ds-row-n">{s.types[t]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sections.includes('thresholds') && (
        <div className="ds-tile ds-th-tile">
          <div className="ds-title">Threshold: needed and provided</div>
          {used.length === 0 ? <div className="ds-none">No spell needs a threshold yet.</div> : (
            <>
              <div className="ds-th">
                {used.map((e) => {
                  const n = s.need[e]
                  // a spell whose threshold the whole atlas can't reach is never cast; a thin supply is slow
                  const short = n.spells > 0 && n.sites < n.peak
                  const thin = !short && n.spells > 0 && n.sites < n.peak + 3
                  const tip = `${NAME[e]}: ${n.spells} spell${n.spells === 1 ? '' : 's'} need it (${n.by[0]} need 1, ${n.by[1]} need 2, ${n.by[2]} need 3 or more); your sites provide ${n.sites}`
                  return (
                    <div key={e} className="ds-th-row" title={tip}>
                      <span className="ds-th-name"><i className={`ds-glyph elem-${e}`}>{GLYPH[e]}</i>{NAME[e]}</span>
                      <span className="ds-th-bars">
                        <span className="ds-track"><span className="ds-needs" style={{ width: `${(n.spells / thMax) * 100}%` }} /><em>{n.spells}</em></span>
                        <span className="ds-track"><span className="ds-gives" style={{ width: `${(n.sites / thMax) * 100}%` }} /><em>{n.sites}</em></span>
                      </span>
                      <span className="ds-th-peak">{n.peak ? `up to ${n.peak}` : ''}</span>
                      <span className={`ds-flag${short ? ' ds-short' : thin ? ' ds-thin' : ''}`}>{short ? '⚠ out of reach' : thin ? '▲ thin' : ''}</span>
                    </div>
                  )
                })}
              </div>
              <div className="ds-legend"><span><i className="ds-key ds-needs" />Spells that need it</span><span><i className="ds-key ds-gives" />Provided by your sites</span></div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
