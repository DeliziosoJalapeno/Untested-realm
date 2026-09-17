import { useMemo, useState } from 'react'
import {
  MIN_ATLAS,
  MIN_SPELLBOOK,
  allCards,
  cardSupport,
  cardTags,
  deckToText,
  findCard,
  getScript,
  parseDeckText,
  printingsFor,
  validateDeck,
  type CardDef,
  type DeckList,
} from '@sorcery/shared'
import { loadDecks, saveDeck, deleteDeckById, newDeckId } from '../App'
import { loadCollection, ownedCopies } from '../collection'
import { ArtProvider, artCtxFromMap } from '../art'
import { useMobileMode } from '../mobile'
import CardImg, { CardHover } from './CardImg'

const ELEMENTS = ['air', 'earth', 'fire', 'water', 'none'] as const
const TYPES = ['Avatar', 'Site', 'Minion', 'Magic', 'Aura', 'Artifact'] as const
const RARITIES = ['Ordinary', 'Exceptional', 'Elite', 'Unique'] as const

// Standard element colours — the exact ones the in-game view uses for threshold pips
// (styles.css .el-air/.el-earth/.el-fire/.el-water). Reused here so elements read the same
// in the deck builder as on the board.
const ELEM_COLOR: Record<string, string> = { air: '#cfd8ff', earth: '#c9a86b', fire: '#ff9a5a', water: '#6bc6ff', none: '#b9c0d8' }
const THRESH_ELEMENTS = ['air', 'earth', 'fire', 'water'] as const
const MAX_COST = 10 // cost slider ceiling (the priciest cards sit well under this)
const MAX_THRESH = 4 // no card demands more than 4 pips of one element

// Curated mechanic-tag filter groups (tag names come from the sorcery-rag taxonomy,
// baked into @sorcery/shared via cardTags). Element / rarity / type / subtype-of-CardDef
// already have their own controls, so these surface the *mechanics* the raw fields don't.
// Filter semantics: OR within a group, AND across groups — "(kill OR banish) AND airborne".
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

// Roles shown in the deck-analysis coverage readout (label → tag). No warnings —
// a 0 just reads as 0, since Sorcery decks legitimately skip whole categories.
const ANALYSIS_ROLES: [string, string][] = [
  ['Removal', 'removal'], ['Kill', 'kill'], ['Damage', 'damage'], ['Card draw', 'draw'],
  ['Ramp', 'ramp'], ['Summon', 'summon'], ['Buff', 'buff'], ['Movement', 'movement_fx'],
  ['Lifegain', 'lifegain'], ['Protection', 'protection'], ['Disruption', 'disruption'], ['Tutor', 'tutor'],
]

function emptyDeck(): DeckList {
  return { id: newDeckId(), name: 'New deck', avatar: '', spellbook: {}, atlas: {} }
}

/** Re-bucket every card into the zone required by the deck's avatar. Normally
 *  sites live in the atlas; a Magician-style avatar (sitesInSpellbook) has NO
 *  atlas and keeps its sites in the spellbook. Called whenever the avatar
 *  changes so an existing site pile moves to the right place automatically. */
function normalizeZones(deck: DeckList): DeckList {
  const sib = !!getScript(deck.avatar)?.sitesInSpellbook
  const all: Record<string, number> = {}
  for (const [n, c] of [...Object.entries(deck.spellbook), ...Object.entries(deck.atlas)]) all[n] = (all[n] ?? 0) + c
  const d = { ...deck, spellbook: {} as Record<string, number>, atlas: {} as Record<string, number> }
  for (const [n, c] of Object.entries(all)) {
    const isSite = findCard(n)?.type === 'Site'
    if (isSite && !sib) d.atlas[n] = c
    else d.spellbook[n] = c
  }
  return d
}

export default function DeckBuilder({ onBack }: { onBack: () => void }) {
  const { mobile } = useMobileMode() // no hover on touch → tap INSPECTS a card (panel), Add is explicit
  const [decks, setDecks] = useState<DeckList[]>(loadDecks())
  const [current, setCurrent] = useState<DeckList>(decks[0] ?? emptyDeck())
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [elemFilter, setElemFilter] = useState<string>('')
  const [rarityFilter, setRarityFilter] = useState<string>('')
  // active mechanic-tag filters (OR within a TAG_GROUPS group, AND across groups)
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set())
  const [showTags, setShowTags] = useState(false)
  // mana-cost range + per-element minimum threshold requirements
  const [costMin, setCostMin] = useState(0)
  const [costMax, setCostMax] = useState(MAX_COST)
  const [thr, setThr] = useState<Record<string, number>>({ air: 0, earth: 0, fire: 0, water: 0 })
  const [thrMax, setThrMax] = useState<Record<string, number>>({ air: MAX_THRESH, earth: MAX_THRESH, fire: MAX_THRESH, water: MAX_THRESH })
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
  const [supportedOnly, setSupportedOnly] = useState(true)
  const [collectionMode, setCollectionMode] = useState(false)
  const collection = useMemo(() => loadCollection(), [collectionMode])
  const [hover, setHover] = useState<string | null>(null)
  // alternative-art picker: the card name whose printings are being chosen (null = closed)
  const [artPick, setArtPick] = useState<string | null>(null)
  // set/clear a card's chosen art (slug); null → revert to the default printing (no override)
  function setArt(name: string, slug: string | null) {
    const art = { ...(current.art ?? {}) }
    if (slug) art[name] = slug
    else delete art[name]
    setCurrent({ ...current, art: Object.keys(art).length ? art : undefined })
  }
  // which pile a clicked card joins (and which the right panel shows): the main
  // deck (spellbook/atlas) or the deck's COLLECTION — the sideboard that "from
  // your collection" spells (Silver Bullet, Toolbox, Molten Maar…) fetch from.
  const [rightView, setRightView] = useState<'deck' | 'collection'>('deck')
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  async function importDeckFromLink() {
    if (!importUrl.trim() || importing) return
    setImporting(true)
    setImportMsg(null)
    try {
      const res = await fetch(`/import-deck?url=${encodeURIComponent(importUrl.trim())}`)
      const body = await res.json()
      if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`)
      const deck = normalizeZones({ ...(body.deck as DeckList), id: newDeckId() }) // fresh id; bucket sites per avatar rule
      const saved = saveDeck(deck) // persist immediately (local + account) as its own deck
      setCurrent(structuredClone(saved))
      setDecks(loadDecks())
      const nSpell = Object.values(deck.spellbook).reduce((a, b) => a + b, 0)
      const nSite = Object.values(deck.atlas).reduce((a, b) => a + b, 0)
      const nCol = Object.values(deck.collection ?? {}).reduce((a, b) => a + b, 0)
      setImportMsg(`Imported "${deck.name}" — ${nSpell} spells, ${nSite} sites${nCol ? `, ${nCol} in collection` : ''}.`)
      setImportUrl('')
    } catch (e: any) {
      setImportMsg(`✗ ${e?.message ?? e}`)
    } finally {
      setImporting(false)
    }
  }

  // active tag filters bucketed by their group, so we can require OR-within / AND-across
  const activeTagGroups = useMemo(
    () => TAG_GROUPS.map((g) => g.tags.map(([t]) => t).filter((t) => tagFilter.has(t))).filter((sel) => sel.length > 0),
    [tagFilter],
  )

  const results = useMemo(() => {
    const q = query.toLowerCase()
    return allCards
      .filter((c) => {
        // "Spell" = anything you cast (not a Site, and not an Avatar) — i.e. the spellbook cards
        if (typeFilter === 'Spell') { if (c.type === 'Site' || c.type === 'Avatar') return false }
        else if (typeFilter && c.type !== typeFilter) return false
        if (rarityFilter && c.rarity !== rarityFilter) return false
        if (elemFilter === 'none' && c.elements.length > 0) return false
        if (elemFilter && elemFilter !== 'none' && !c.elements.map((e) => e.toLowerCase()).includes(elemFilter)) return false
        if (supportedOnly && cardSupport(c) === 'unsupported') return false
        if (collectionMode && ownedCopies(collection, c.name) === 0) return false
        if (q && !c.name.toLowerCase().includes(q) && !c.text.toLowerCase().includes(q)) return false
        // mana cost — cards with no printed cost (Sites) are excluded once a cost range is set
        if (costActive) {
          if (c.cost == null) return false
          if (c.cost < costMin || c.cost > costMax) return false
        }
        // elemental thresholds — a card must sit within each element's [min, max] requirement
        if (thrActive && THRESH_ELEMENTS.some((e) => { const t = c.thresholds?.[e] ?? 0; return t < thr[e] || t > thrMax[e] })) return false
        if (activeTagGroups.length) {
          const tags = new Set(cardTags(c.name))
          if (!activeTagGroups.every((sel) => sel.some((t) => tags.has(t)))) return false
        }
        return true
      })
      .slice(0, 120)
  }, [query, typeFilter, rarityFilter, elemFilter, supportedOnly, collectionMode, collection, activeTagGroups, costActive, costMin, costMax, thrActive, thr, thrMax])

  const problems = useMemo(() => {
    const base = validateDeck(current)
    if (collectionMode) {
      const piles = [...Object.entries(current.spellbook), ...Object.entries(current.atlas), ...Object.entries(current.collection ?? {})]
      for (const [name, copies] of piles) {
        const owned = ownedCopies(collection, name)
        if (copies > owned) base.push({ level: 'error', msg: `${name}: you own only ${owned} cop${owned === 1 ? 'y' : 'ies'}` })
      }
    }
    return base
  }, [current, collectionMode, collection])
  const spellCount = Object.values(current.spellbook).reduce((a, b) => a + b, 0)
  const siteCount = Object.values(current.atlas).reduce((a, b) => a + b, 0)
  const collCount = Object.values(current.collection ?? {}).reduce((a, b) => a + b, 0)

  // Magician-style avatars keep their sites in the spellbook and run an empty atlas.
  const sitesInSpellbook = !!getScript(current.avatar)?.sitesInSpellbook

  function addCard(c: CardDef) {
    const next = structuredClone(current)
    // Collection tab: ANY card — including Avatars — joins the deck's collection.
    if (rightView === 'collection') {
      next.collection = { ...(next.collection ?? {}) }
      next.collection[c.name] = (next.collection[c.name] ?? 0) + 1
      setCurrent(next)
      return
    }
    // Main deck tab: an Avatar fills the avatar slot; everything else joins its pile.
    if (c.type === 'Avatar') {
      next.avatar = c.name
      // moving to/from a Magician-style avatar re-buckets the existing site pile
      setCurrent(normalizeZones(next))
      return
    }
    if (c.type === 'Site' && !sitesInSpellbook) next.atlas[c.name] = (next.atlas[c.name] ?? 0) + 1
    else next.spellbook[c.name] = (next.spellbook[c.name] ?? 0) + 1
    setCurrent(next)
  }

  function removeCard(zone: 'spellbook' | 'atlas' | 'collection', name: string) {
    const next = structuredClone(current)
    const pile = zone === 'collection' ? (next.collection = { ...(next.collection ?? {}) }) : next[zone]
    pile[name] = (pile[name] ?? 1) - 1
    if (pile[name] <= 0) delete pile[name]
    setCurrent(next)
  }

  function persist() {
    const saved = saveDeck(current) // one deck, by id (local + account)
    setCurrent(saved)
    setDecks(loadDecks())
  }
  function removeCurrent() {
    if (current.id) deleteDeckById(current.id)
    const remaining = loadDecks()
    setDecks(remaining)
    setCurrent(remaining[0] ?? emptyDeck())
  }

  return (
    <ArtProvider value={artCtxFromMap(current.art)}>
    <div className="deckbuilder">
      <div className="db-toolbar">
        <button onClick={onBack}>← Back</button>
        <select
          value={current.id ?? ''}
          onChange={(e) => {
            const d = decks.find((x) => x.id === e.target.value)
            if (d) setCurrent(structuredClone(d))
          }}
        >
          {decks.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <button onClick={() => setCurrent(emptyDeck())}>New</button>
        <input value={current.name} onChange={(e) => setCurrent({ ...current, name: e.target.value })} />
        <button onClick={persist}>Save</button>
        <button onClick={removeCurrent} disabled={!current.id || decks.every((d) => d.id !== current.id)} title="Delete this deck">🗑 Delete</button>
        <button onClick={() => setShowImport(!showImport)}>Import / Export</button>
      </div>

      {showImport && (
        <div className="panel">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') importDeckFromLink() }}
              placeholder="Paste a sorcerytcg.com deck link (https://sorcerytcg.com/decks/…)"
              style={{ flex: 1, padding: 6 }}
            />
            <button onClick={importDeckFromLink} disabled={importing || !importUrl.trim()}>
              {importing ? 'Importing…' : 'Import deck'}
            </button>
          </div>
          {importMsg && <div style={{ fontSize: 13, marginBottom: 8, opacity: 0.9 }}>{importMsg}</div>}
          <textarea rows={8} value={importText || deckToText(current)} onChange={(e) => setImportText(e.target.value)} style={{ width: '100%' }} />
          <button
            onClick={() => {
              // Parse whatever the textarea is actually showing: the edited text if any,
              // otherwise the current deck's own text (so this never nukes a loaded deck).
              const text = importText.trim() ? importText : deckToText(current)
              const parsed = normalizeZones({
                ...parseDeckText(current.name, text),
                id: current.id, // keep it the SAME deck, don't detach into a new one
                fromCollection: current.fromCollection,
              })
              setCurrent(parsed)
              setShowImport(false)
              setImportText('')
            }}
          >
            Apply text to deck
          </button>
        </div>
      )}

      <div className="db-columns">
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
            <label>
              <input
                type="checkbox"
                checked={collectionMode}
                onChange={(e) => {
                  setCollectionMode(e.target.checked)
                  setCurrent({ ...current, fromCollection: e.target.checked || undefined })
                }}
              />{' '}
              🎴 my cards only
            </label>
            <button className={`db-tagtoggle${showTags ? ' open' : ''}${advCount ? ' has' : ''}`} onClick={() => setShowTags((v) => !v)}>
              🔧 Filters{advCount ? ` (${advCount})` : ''}
            </button>
            {advCount > 0 && <button className="db-tagclear" title="Clear cost, threshold & mechanic filters" onClick={resetAdvanced}>clear ✕</button>}
          </div>
          {showTags && (
            <div className="db-advpanel">
              {/* cost + threshold widget — separate box, sits beside the mechanics chips */}
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
              {/* mechanic-tag chips */}
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
            {results.map((c) => (
              <div
                key={c.name}
                className={`db-card${mobile && hover === c.name ? ' picked' : ''}`}
                onMouseEnter={() => setHover(c.name)}
                onMouseLeave={mobile ? undefined : () => setHover(null)}
                // desktop: click adds. mobile: click INSPECTS (shows the card panel); Add is an explicit button there.
                onClick={mobile ? () => setHover(c.name) : () => addCard(c)}
              >
                <CardImg name={c.name} className="db-thumb" />
                <span className={`badge ${cardSupport(c)}`}>{cardSupport(c) === 'unsupported' ? 'manual' : '✓'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="db-deck">
          <div className="db-tabs">
            <button className={rightView === 'deck' ? 'active' : ''} onClick={() => setRightView('deck')}>
              Main deck ({spellCount + siteCount})
            </button>
            <button className={rightView === 'collection' ? 'active' : ''} onClick={() => setRightView('collection')}>
              Collection ({collCount})
            </button>
          </div>

          {rightView === 'deck' ? (
            <>
              <h3>Avatar: {current.avatar || <i>none</i>}</h3>
              <h3>Spellbook ({spellCount}/{MIN_SPELLBOOK}+){sitesInSpellbook && ' — sites included'}</h3>
              {Object.entries(current.spellbook).map(([n, c]) => (
                <div key={n} className="db-row" onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}>
                  <span>{c}× {n}</span>
                  {printingsFor(n).length > 0 && <button title="Choose art" className={current.art?.[n] ? 'art-on' : ''} onClick={() => setArtPick(n)}>🎨</button>}
                  <button onClick={() => removeCard('spellbook', n)}>−</button>
                </div>
              ))}
              <h3>{sitesInSpellbook ? <>Atlas <i>(empty — {current.avatar} keeps sites in the spellbook)</i></> : <>Atlas ({siteCount}/{MIN_ATLAS}+)</>}</h3>
              {Object.entries(current.atlas).map(([n, c]) => (
                <div key={n} className="db-row" onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}>
                  <span>{c}× {n}</span>
                  {printingsFor(n).length > 0 && <button title="Choose art" className={current.art?.[n] ? 'art-on' : ''} onClick={() => setArtPick(n)}>🎨</button>}
                  <button onClick={() => removeCard('atlas', n)}>−</button>
                </div>
              ))}
            </>
          ) : (
            <>
              <h3>Collection ({collCount})</h3>
              <p className="db-hint">Cards outside the deck that “from your collection” spells (Silver Bullet, Toolbox, Molten Maar…) may fetch. Click cards on the left to add them here.</p>
              {Object.entries(current.collection ?? {}).map(([n, c]) => (
                <div key={n} className="db-row" onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}>
                  <span>{c}× {n}</span>
                  {printingsFor(n).length > 0 && <button title="Choose art" className={current.art?.[n] ? 'art-on' : ''} onClick={() => setArtPick(n)}>🎨</button>}
                  <button onClick={() => removeCard('collection', n)}>−</button>
                </div>
              ))}
              {collCount === 0 && <div className="db-hint"><i>No cards in the collection yet.</i></div>}
            </>
          )}

          <div className="db-problems">
            {problems.map((p, i) => (
              <div key={i} className={p.level}>
                {p.msg}
              </div>
            ))}
            {problems.length === 0 && <div className="okmsg">Deck is legal ✓</div>}
          </div>
        </div>

        <div className="db-preview">
          {artPick ? (
            <div className="art-picker">
              <div className="art-picker-head">
                <b>{artPick}</b>
                <button title="Close" onClick={() => setArtPick(null)}>✕</button>
              </div>
              <div className="art-grid">
                {printingsFor(artPick).map((p) => {
                  const cur = current.art?.[artPick]
                  const sel = cur ? cur === p.slug : !!p.default
                  return (
                    <button
                      key={p.slug}
                      className={`art-opt ${sel ? 'sel' : ''}`}
                      title={p.artist ? `${p.set} — art by ${p.artist}` : p.set}
                      onClick={() => setArt(artPick, p.default ? null : p.slug)}
                    >
                      <CardImg name={artPick} art={p.slug} className="art-thumb" />
                      <span>{p.set}{p.default ? ' · default' : ''}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : hover ? (
            <>
              {mobile && findCard(hover) && (
                <button className="db-mobile-add" onClick={() => { const c = findCard(hover); if (c) addCard(c) }}>
                  ＋ Add {rightView === 'collection' ? 'to collection' : 'to deck'}
                </button>
              )}
              <CardHover name={hover} />
            </>
          ) : <DeckAnalysis deck={current} />}
        </div>
      </div>
    </div>
    </ArtProvider>
  )
}

/** Live read-out of the current main deck (spellbook + atlas): mechanic coverage,
 *  mana-cost curve, and element balance. Purely descriptive — no warnings, since
 *  Sorcery decks legitimately skip whole categories. */
function DeckAnalysis({ deck }: { deck: DeckList }) {
  const a = useMemo(() => {
    const main = [...Object.entries(deck.spellbook), ...Object.entries(deck.atlas)]
    const total = main.reduce((s, [, c]) => s + c, 0)

    // mechanic coverage (copies of cards carrying each role's tag)
    const coverage = ANALYSIS_ROLES.map(([label, tag]) => {
      let n = 0
      for (const [name, copies] of main) if (cardTags(name).includes(tag)) n += copies
      return { label, n }
    })
    const covMax = Math.max(1, ...coverage.map((c) => c.n))

    // mana-cost curve — only cards with a printed cost (sites have none)
    const buckets = ['1', '2', '3', '4', '5', '6+']
    const curve = new Array(buckets.length).fill(0)
    for (const [name, copies] of main) {
      const cost = findCard(name)?.cost
      if (cost == null) continue
      curve[Math.min(Math.max(cost, 1), 6) - 1] += copies
    }
    const curveMax = Math.max(1, ...curve)

    // element balance (a multi-element card counts toward each of its elements)
    const elems = ['air', 'earth', 'fire', 'water'] as const
    const byElem: Record<string, number> = { air: 0, earth: 0, fire: 0, water: 0, none: 0 }
    for (const [name, copies] of main) {
      const els = (findCard(name)?.elements ?? []).map((e) => e.toLowerCase())
      if (els.length === 0) byElem.none += copies
      for (const e of els) if (e in byElem) byElem[e] += copies
    }

    return { total, coverage, covMax, buckets, curve, curveMax, elems, byElem }
  }, [deck])

  const ELEM_GLYPH: Record<string, string> = { air: '🜁', earth: '🜃', fire: '🜂', water: '🜄', none: '◇' }

  if (a.total === 0) return <div className="db-analysis db-analysis-empty">Add cards to see a deck analysis.</div>

  return (
    <div className="db-analysis">
      <h4>📊 Deck analysis <span className="da-total">{a.total} cards</span></h4>

      <div className="da-section">
        <div className="da-title">Mechanic coverage</div>
        {a.coverage.map((c) => (
          <div key={c.label} className="da-cov">
            <span className="da-cov-label">{c.label}</span>
            <span className="da-bar"><span className="da-bar-fill" style={{ width: `${(c.n / a.covMax) * 100}%` }} /></span>
            <span className="da-cov-n">{c.n}</span>
          </div>
        ))}
      </div>

      <div className="da-section">
        <div className="da-title">Mana curve</div>
        <div className="da-curve">
          {a.curve.map((n, i) => (
            <div key={i} className="da-col" title={`cost ${a.buckets[i]}: ${n}`}>
              <span className="da-col-n">{n || ''}</span>
              <span className="da-col-bar" style={{ height: `${(n / a.curveMax) * 100}%` }} />
              <span className="da-col-x">{a.buckets[i]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="da-section">
        <div className="da-title">Elements</div>
        <div className="da-elems">
          {(['air', 'earth', 'fire', 'water', 'none'] as const).map((e) =>
            a.byElem[e] > 0 ? (
              <span key={e} className={`da-elem elem-${e}`} title={e}>
                {ELEM_GLYPH[e]} {a.byElem[e]}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  )
}
