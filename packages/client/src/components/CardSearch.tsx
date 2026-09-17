import { useMemo, useState } from 'react'
import { allCards, cardSupport, cardTags, type CardDef } from '@sorcery/shared'
import { ownedCopies, type Collection } from '../collection'
import CardImg from './CardImg'

const ELEMENTS = ['air', 'earth', 'fire', 'water', 'none'] as const
const TYPES = ['Avatar', 'Site', 'Minion', 'Magic', 'Aura', 'Artifact'] as const
const RARITIES = ['Ordinary', 'Exceptional', 'Elite', 'Unique'] as const

// Standard element colours — the exact ones the in-game view uses for threshold pips.
const ELEM_COLOR: Record<string, string> = { air: '#cfd8ff', earth: '#c9a86b', fire: '#ff9a5a', water: '#6bc6ff', none: '#b9c0d8' }
const THRESH_ELEMENTS = ['air', 'earth', 'fire', 'water'] as const
const MAX_COST = 10 // cost slider ceiling (the priciest cards sit well under this)
const MAX_THRESH = 4 // no card demands more than 4 pips of one element

// Curated mechanic-tag filter groups (tag names come from the sorcery-rag taxonomy, baked into
// @sorcery/shared via cardTags). Filter semantics: OR within a group, AND across groups.
const TAG_GROUPS: { label: string; tags: [string, string][] }[] = [
  { label: 'Roles', tags: [['removal', 'Removal'], ['card_advantage', 'Card advantage'], ['protection', 'Protection'], ['evasion', 'Evasion'], ['disruption', 'Disruption'], ['ramp', 'Ramp']] },
  { label: 'Effects', tags: [['damage', 'Damage'], ['draw', 'Draw'], ['summon', 'Summon'], ['movement_fx', 'Movement'], ['lifegain', 'Lifegain'], ['token', 'Tokens'], ['conjure', 'Conjure'], ['discard', 'Discard'], ['sacrifice', 'Sacrifice'], ['mill', 'Mill'], ['tutor', 'Tutor'], ['reanimate', 'Reanimate']] },
  { label: 'Kill / destroy', tags: [['kill', 'Kill'], ['destroy', 'Destroy'], ['banish', 'Banish'], ['pacify', 'Pacify'], ['disable', 'Disable'], ['bounce', 'Bounce'], ['transform', 'Transform']] },
  { label: 'Buffs & control', tags: [['buff', 'Buff'], ['debuff', 'Debuff'], ['control', 'Take control'], ['displace', 'Displace'], ['tap_down', 'Tap down'], ['copy', 'Copy'], ['counter', 'Counter'], ['cost_reduction', 'Cost reduction']] },
  { label: 'Triggers', tags: [['genesis', 'Genesis'], ['deathrite', 'Deathrite'], ['tap_ability', 'Tap ability']] },
  { label: 'Keywords', tags: [['airborne', 'Airborne'], ['ward', 'Ward'], ['stealth', 'Stealth'], ['lethal', 'Lethal'], ['charge', 'Charge'], ['ranged', 'Ranged'], ['burrowing', 'Burrowing'], ['submerge', 'Submerge'], ['voidwalk', 'Voidwalk'], ['spellcaster', 'Spellcaster'], ['immobile', 'Immobile'], ['strike_first', 'Strike first'], ['lance', 'Lance'], ['movement_bonus', 'Movement +X'], ['projectile', 'Projectile'], ['carry', 'Carry'], ['lifelink', 'Lifelink']] },
  { label: 'Subtypes', tags: [['mortal', 'Mortal'], ['beast', 'Beast'], ['undead', 'Undead'], ['spirit', 'Spirit'], ['demon', 'Demon'], ['faerie', 'Faerie'], ['monster', 'Monster'], ['dragon', 'Dragon'], ['giant', 'Giant'], ['angel', 'Angel'], ['relic', 'Relic'], ['weapon', 'Weapon'], ['monument', 'Monument'], ['automaton', 'Automaton'], ['device', 'Device'], ['merfolk', 'Merfolk'], ['troll', 'Troll']] },
  { label: 'Cemetery', tags: [['cemetery', 'Cemetery']] },
]

export interface CardSearchProps {
  /** click a card (desktop) or tap Add (mobile, handled by the parent's preview panel) */
  onPick: (c: CardDef) => void
  /** hover/tap a card — the parent uses this to drive its card-preview panel */
  onHover?: (name: string | null) => void
  /** the card the parent is currently previewing (mobile highlights it as "picked") */
  hovered?: string | null
  mobile?: boolean
  /** owned collection, for the "my cards only" filter (and its owned-count badges) */
  collection?: Collection
  /** show a per-result "×N owned" badge (the collection page wants this; the deck builder doesn't) */
  showOwned?: boolean
  /** render + control the "🎴 my cards only" checkbox. Omit `onMyCardsOnlyChange` to hide it. */
  myCardsOnly?: boolean
  onMyCardsOnlyChange?: (v: boolean) => void
}

/** The card search + filter grid shared by the deck builder and the collection page: text search,
 *  type / element / rarity selects, a mana-cost + threshold + mechanic-tag advanced panel, and a
 *  results grid. Clicking a result calls `onPick` (desktop) or `onHover` to inspect (mobile). */
export default function CardSearch({ onPick, onHover, hovered, mobile, collection, showOwned, myCardsOnly, onMyCardsOnlyChange }: CardSearchProps) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [elemFilter, setElemFilter] = useState<string>('')
  const [rarityFilter, setRarityFilter] = useState<string>('')
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set())
  const [showTags, setShowTags] = useState(false)
  const [costMin, setCostMin] = useState(0)
  const [costMax, setCostMax] = useState(MAX_COST)
  const [thr, setThr] = useState<Record<string, number>>({ air: 0, earth: 0, fire: 0, water: 0 })
  const [thrMax, setThrMax] = useState<Record<string, number>>({ air: MAX_THRESH, earth: MAX_THRESH, fire: MAX_THRESH, water: MAX_THRESH })
  const [supportedOnly, setSupportedOnly] = useState(true)
  const collectionMode = !!myCardsOnly

  const costActive = costMin > 0 || costMax < MAX_COST
  const thrActive = THRESH_ELEMENTS.some((e) => thr[e] > 0 || thrMax[e] < MAX_THRESH)
  const advCount = tagFilter.size + (costActive ? 1 : 0) +
    THRESH_ELEMENTS.filter((e) => thr[e] > 0).length + THRESH_ELEMENTS.filter((e) => thrMax[e] < MAX_THRESH).length
  function resetAdvanced() {
    setTagFilter(new Set())
    setCostMin(0); setCostMax(MAX_COST)
    setThr({ air: 0, earth: 0, fire: 0, water: 0 })
    setThrMax({ air: MAX_THRESH, earth: MAX_THRESH, fire: MAX_THRESH, water: MAX_THRESH })
  }
  function toggleTag(tag: string) {
    setTagFilter((prev) => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  const activeTagGroups = useMemo(
    () => TAG_GROUPS.map((g) => g.tags.map(([t]) => t).filter((t) => tagFilter.has(t))).filter((sel) => sel.length > 0),
    [tagFilter],
  )

  const results = useMemo(() => {
    const q = query.toLowerCase()
    return allCards
      .filter((c) => {
        if (typeFilter === 'Spell') { if (c.type === 'Site' || c.type === 'Avatar') return false }
        else if (typeFilter && c.type !== typeFilter) return false
        if (rarityFilter && c.rarity !== rarityFilter) return false
        if (elemFilter === 'none' && c.elements.length > 0) return false
        if (elemFilter && elemFilter !== 'none' && !c.elements.map((e) => e.toLowerCase()).includes(elemFilter)) return false
        if (supportedOnly && cardSupport(c) === 'unsupported') return false
        if (collectionMode && collection && ownedCopies(collection, c.name) === 0) return false
        if (q && !c.name.toLowerCase().includes(q) && !c.text.toLowerCase().includes(q)) return false
        if (costActive) {
          if (c.cost == null) return false
          if (c.cost < costMin || c.cost > costMax) return false
        }
        if (thrActive && THRESH_ELEMENTS.some((e) => { const t = c.thresholds?.[e] ?? 0; return t < thr[e] || t > thrMax[e] })) return false
        if (activeTagGroups.length) {
          const tags = new Set(cardTags(c.name))
          if (!activeTagGroups.every((sel) => sel.some((t) => tags.has(t)))) return false
        }
        return true
      })
      .slice(0, 120)
  }, [query, typeFilter, rarityFilter, elemFilter, supportedOnly, collectionMode, collection, activeTagGroups, costActive, costMin, costMax, thrActive, thr, thrMax])

  return (
    <div className="db-search">
      <div className="db-filters">
        <input placeholder="search name or text…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">any type</option>
          <option value="Spell">Spell</option>
          {TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select value={elemFilter} onChange={(e) => setElemFilter(e.target.value)}>
          <option value="">any element</option>
          {ELEMENTS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)}>
          <option value="">any rarity</option>
          {RARITIES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <label>
          <input type="checkbox" checked={supportedOnly} onChange={(e) => setSupportedOnly(e.target.checked)} /> playable only
        </label>
        {onMyCardsOnlyChange && (
          <label>
            <input type="checkbox" checked={collectionMode} onChange={(e) => onMyCardsOnlyChange(e.target.checked)} /> 🎴 my cards only
          </label>
        )}
        <button className={`db-tagtoggle${showTags ? ' open' : ''}${advCount ? ' has' : ''}`} onClick={() => setShowTags((v) => !v)}>
          🔧 Filters{advCount ? ` (${advCount})` : ''}
        </button>
        {advCount > 0 && <button className="db-tagclear" title="Clear cost, threshold & mechanic filters" onClick={resetAdvanced}>clear ✕</button>}
      </div>
      {showTags && (
        <div className="db-advpanel">
          <div className="db-costwidget">
            <div className="db-taggroup-label">Mana cost</div>
            <div className="db-costrow">
              <span className="db-costval">{costMin}</span>
              <div className="db-costsliders">
                <input type="range" min={0} max={MAX_COST} value={costMin}
                  onChange={(e) => setCostMin(Math.min(+e.target.value, costMax))} />
                <input type="range" min={0} max={MAX_COST} value={costMax}
                  onChange={(e) => setCostMax(Math.max(+e.target.value, costMin))} />
              </div>
              <span className="db-costval">{costMax === MAX_COST ? `${MAX_COST}+` : costMax}</span>
            </div>
            <div className="db-taggroup-label" style={{ marginTop: 8 }}>Thresholds (min)</div>
            {THRESH_ELEMENTS.map((el) => (
              <div key={el} className="db-thrrow">
                <span className="db-thrlabel" style={{ color: ELEM_COLOR[el] }}>{el}</span>
                <input type="range" min={0} max={MAX_THRESH} value={thr[el]}
                  style={{ accentColor: ELEM_COLOR[el] }}
                  onChange={(e) => setThr({ ...thr, [el]: Math.min(+e.target.value, thrMax[el]) })} />
                <span className="db-thrval" style={{ color: thr[el] > 0 ? ELEM_COLOR[el] : undefined }}>{thr[el]}</span>
              </div>
            ))}
            <div className="db-taggroup-label" style={{ marginTop: 8 }}>Thresholds (max)</div>
            {THRESH_ELEMENTS.map((el) => (
              <div key={el} className="db-thrrow">
                <span className="db-thrlabel" style={{ color: ELEM_COLOR[el] }}>{el}</span>
                <input type="range" min={0} max={MAX_THRESH} value={thrMax[el]}
                  style={{ accentColor: ELEM_COLOR[el] }}
                  onChange={(e) => setThrMax({ ...thrMax, [el]: Math.max(+e.target.value, thr[el]) })} />
                <span className="db-thrval" style={{ color: thrMax[el] < MAX_THRESH ? ELEM_COLOR[el] : undefined }}>{thrMax[el] === MAX_THRESH ? `${MAX_THRESH}+` : thrMax[el]}</span>
              </div>
            ))}
          </div>
          <div className="db-tagpanel">
            <div className="db-taghint">Any within a row · all across rows</div>
            {TAG_GROUPS.map((g) => (
              <div key={g.label} className="db-taggroup">
                <span className="db-taggroup-label">{g.label}</span>
                <div className="db-tagchips">
                  {g.tags.map(([tag, label]) => (
                    <button
                      key={tag}
                      className={`db-tagchip${tagFilter.has(tag) ? ' on' : ''}`}
                      onClick={() => toggleTag(tag)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="db-results">
        {results.map((c) => {
          const owned = showOwned && collection ? ownedCopies(collection, c.name) : 0
          return (
            <div
              key={c.name}
              className={`db-card${mobile && hovered === c.name ? ' picked' : ''}`}
              onMouseEnter={() => onHover?.(c.name)}
              onMouseLeave={mobile ? undefined : () => onHover?.(null)}
              // desktop: click adds. mobile: click INSPECTS (the parent shows Add in its preview).
              onClick={mobile ? () => onHover?.(c.name) : () => onPick(c)}
            >
              <CardImg name={c.name} className="db-thumb" />
              {showOwned
                ? <span className={`badge ${owned > 0 ? 'owned' : 'unowned'}`}>{owned > 0 ? `×${owned}` : '＋'}</span>
                : <span className={`badge ${cardSupport(c)}`}>{cardSupport(c) === 'unsupported' ? 'manual' : '✓'}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
