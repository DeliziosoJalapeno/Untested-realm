import { useMemo, useState } from 'react'
import {
  MIN_ATLAS,
  MIN_SPELLBOOK,
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
import CardSearch from './CardSearch'

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
        <CardSearch
          onPick={addCard}
          onHover={setHover}
          hovered={hover}
          mobile={mobile}
          collection={collection}
          myCardsOnly={collectionMode}
          onMyCardsOnlyChange={(v) => {
            setCollectionMode(v)
            setCurrent({ ...current, fromCollection: v || undefined })
          }}
        />

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
