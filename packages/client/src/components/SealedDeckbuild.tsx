// Sealed (Limited) deck-construction — laid out like the Collection page: the BOOSTER
// OPENER sits at the TOP (open one booster at a time, flip cards / Reveal booster / Next
// booster), and BELOW it the deck-builder grid FILLS with the cards as you reveal them
// (same db-* graphics as the standard Deck Builder). Once every booster is opened you can
// HIDE the opener to give the builder the whole screen. The deck + Ready flag are pushed
// to the server; on timeout the server auto-fills whatever you have.
import { useEffect, useMemo, useState } from 'react'
import {
  cardSupport,
  findCard,
  aggregatePool,
  validateSealedDeck,
  sealedAvailable,
  isSuppliedSite,
  MIN_SEALED_SPELLBOOK,
  MIN_SEALED_ATLAS,
  SEALED_SUPPLIED_AVATAR,
  SEALED_SUPPLIED_SITES,
  getScript,
  type CardDef,
  type DeckList,
} from '@sorcery/shared'
import CardImg, { CardHover, CardBack, backKindFor } from './CardImg'

const ELEMENTS = ['air', 'earth', 'fire', 'water', 'none'] as const
const TYPES = ['Avatar', 'Site', 'Minion', 'Magic', 'Aura', 'Artifact'] as const

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const total = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0)

export default function SealedDeckbuild({
  pool, packs, edition, numPacks, deadline, oppReady, oppPresent, youReady, initialDeck, spectator, roomKey, onSubmit, onLeave,
}: {
  pool: Record<string, number>
  packs: string[][]
  edition: string
  numPacks: number
  deadline: number | null
  oppReady: boolean
  oppPresent: boolean
  youReady: boolean
  initialDeck: DeckList | null
  spectator: boolean
  /** stable per-room key: reveal progress is persisted under it so a reconnect / page reload
   *  doesn't reset the opened pool (which would leave only the supplied "standard" cards). */
  roomKey: string
  onSubmit: (deck: DeckList, ready: boolean) => void
  onLeave: () => void
}) {
  const [avatar, setAvatar] = useState(initialDeck?.avatar || SEALED_SUPPLIED_AVATAR)
  const [spellbook, setSpellbook] = useState<Record<string, number>>(initialDeck?.spellbook ?? {})
  const [atlas, setAtlas] = useState<Record<string, number>>(initialDeck?.atlas ?? {})
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [elemFilter, setElemFilter] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  // booster opener (top): current booster index + how many of it are flipped, and whether
  // the opener is collapsed. The deck-builder grid below shows only cards revealed so far.
  // Reveal progress is PERSISTED per room so a reconnect / page reload restores your opened
  // pool (otherwise it would reset to 0 and you'd see only the supplied "standard" cards).
  const progressKey = `sealed-progress:${roomKey}`
  const savedProgress = useMemo(() => {
    try { const raw = localStorage.getItem(progressKey); return raw ? JSON.parse(raw) as { packIdx: number; revealed: number; boosterHidden: boolean } : null } catch { return null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressKey])
  const [packIdx, setPackIdx] = useState(savedProgress?.packIdx ?? 0)
  const [revealed, setRevealed] = useState(savedProgress?.revealed ?? 0)
  const [boosterHidden, setBoosterHidden] = useState(savedProgress?.boosterHidden ?? false)
  // Safety net for sessions opened BEFORE this persistence existed: if we reconnect with a deck
  // already built (so packs were clearly opened) but progress is at the start, reveal everything
  // — your owned pool must never collapse to just the supplied cards.
  const deckHasCards = total(initialDeck?.spellbook ?? {}) + total(initialDeck?.atlas ?? {}) > 0
  useEffect(() => {
    if (!savedProgress && deckHasCards && packs.length > 0 && packIdx === 0 && revealed === 0) {
      setPackIdx(packs.length - 1)
      setRevealed(packs[packs.length - 1]?.length ?? 0)
      setBoosterHidden(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packs.length])
  // persist progress on every change (clamped to real bounds on read below)
  useEffect(() => {
    try { localStorage.setItem(progressKey, JSON.stringify({ packIdx, revealed, boosterHidden })) } catch { /* ignore quota/private-mode */ }
  }, [progressKey, packIdx, revealed, boosterHidden])
  const currentPack = packs[packIdx] ?? []
  const packDone = revealed >= currentPack.length
  const lastPack = packIdx >= packs.length - 1
  const allOpened = lastPack && packDone
  const reveal = (n: number) => setRevealed((r) => Math.min(currentPack.length, Math.max(r, n)))

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  // the pool you've REVEALED so far (fully-opened boosters + this booster's flipped cards).
  const openedPool = useMemo(() => {
    const agg = aggregatePool(packs.slice(0, packIdx))
    for (const name of currentPack.slice(0, revealed)) agg[name] = (agg[name] ?? 0) + 1
    return agg
  }, [packs, packIdx, revealed, currentPack])

  const deck: DeckList = useMemo(() => ({ name: 'Sealed', avatar, spellbook, atlas }), [avatar, spellbook, atlas])
  const sitesInSpellbook = !!getScript(avatar)?.sitesInSpellbook

  // copies still addable = what you've opened (supplied = ∞) minus what's in the deck
  const available = (name: string) => (isSuppliedSite(name) || name === SEALED_SUPPLIED_AVATAR ? Infinity : openedPool[name] ?? 0)
  const remaining = (name: string) => available(name) - (spellbook[name] ?? 0) - (atlas[name] ?? 0)

  // the builder grid: cards you've opened + the always-available supplied cards
  const gridDefs = useMemo(() => {
    const names = new Set<string>([...Object.keys(openedPool), SEALED_SUPPLIED_AVATAR, ...SEALED_SUPPLIED_SITES])
    return [...names].map((n) => findCard(n)).filter((d): d is CardDef => !!d).sort((a, b) => a.name.localeCompare(b.name))
  }, [openedPool])

  const results = useMemo(() => {
    const q = query.toLowerCase()
    return gridDefs.filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false
      if (elemFilter === 'none' && c.elements.length > 0) return false
      if (elemFilter && elemFilter !== 'none' && !c.elements.map((e) => e.toLowerCase()).includes(elemFilter)) return false
      if (q && !c.name.toLowerCase().includes(q) && !c.text.toLowerCase().includes(q)) return false
      return true
    })
  }, [gridDefs, query, typeFilter, elemFilter])

  function addCard(c: CardDef) {
    if (spectator) return
    if (c.type === 'Avatar') { setAvatar(c.name); return }
    if (remaining(c.name) <= 0) return
    if (c.type === 'Site' && !sitesInSpellbook) setAtlas((m) => ({ ...m, [c.name]: (m[c.name] ?? 0) + 1 }))
    else setSpellbook((m) => ({ ...m, [c.name]: (m[c.name] ?? 0) + 1 }))
  }
  function removeCard(zone: 'spellbook' | 'atlas', name: string) {
    const setter = zone === 'spellbook' ? setSpellbook : setAtlas
    setter((m) => { const n = { ...m }; n[name] = (n[name] ?? 1) - 1; if (n[name] <= 0) delete n[name]; return n })
  }
  function openAll() { setPackIdx(Math.max(0, packs.length - 1)); setRevealed(packs[packs.length - 1]?.length ?? 0); setBoosterHidden(true) }
  function nextBooster() { setPackIdx((i) => i + 1); setRevealed(0) }

  // push the deck to the server on every edit (so a timeout auto-fill uses your latest
  // picks) and whenever the Ready flag flips.
  useEffect(() => {
    if (!spectator) onSubmit(deck, youReady)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar, JSON.stringify(spellbook), JSON.stringify(atlas)])

  const problems = validateSealedDeck(deck, pool)
  const errors = problems.filter((p) => p.level === 'error')
  const spellCount = total(spellbook)
  const siteCount = total(atlas)
  const timeLeft = deadline ? deadline - now : null

  if (spectator) {
    return (
      <div className="deckbuilder">
        <div className="db-toolbar">
          <button onClick={onLeave}>← Leave</button>
          <b>Sealed — deck construction</b>
          <span className="spacer" />
          <span className="sealed-timer">{timeLeft != null ? `⏳ ${fmt(timeLeft)}` : 'waiting…'}</span>
        </div>
        <p style={{ padding: 20 }}>Both players are building their sealed decks (pools are hidden). The game begins when they’re ready.</p>
      </div>
    )
  }

  return (
    <div className="deckbuilder">
      <div className="db-toolbar">
        <button onClick={onLeave}>← Leave</button>
        <b>Sealed deckbuild</b>
        <span className="db-hint">{numPacks}× {edition} · pool of {total(pool)} · Spellbook ≥{MIN_SEALED_SPELLBOOK}, Atlas ≥{MIN_SEALED_ATLAS}, no rarity limits</span>
        <span className="spacer" />
        <span className={`sealed-timer${timeLeft != null && timeLeft < 60_000 ? ' low' : ''}`}>
          {timeLeft != null ? `⏳ ${fmt(timeLeft)}` : 'waiting for opponent…'}
        </span>
        <span className="sealed-opp">{oppPresent ? (oppReady ? '✅ opponent ready' : '⌛ opponent building') : 'opponent not here'}</span>
        <button
          className={`sealed-ready${youReady ? ' on' : ''}`}
          disabled={!youReady && errors.length > 0}
          title={errors.length ? errors.map((p) => p.msg).join('\n') : ''}
          onClick={() => onSubmit(deck, !youReady)}
        >
          {youReady ? '✓ Ready — click to edit' : errors.length ? `Not legal (${errors.length})` : 'Ready ▶'}
        </button>
      </div>

      {/* TOP: the booster opener (one booster at a time), collapsible once all are opened */}
      {boosterHidden ? (
        <button className="sealed-showboosters" onClick={() => setBoosterHidden(false)}>🎴 Show booster opening ▼</button>
      ) : (
        <div className="panel sealed-reveal">
          <div className="sealed-reveal-head">
            <h3>
              Booster {packIdx + 1} of {packs.length} — {revealed}/{currentPack.length} revealed
              {!packDone ? ' · click a card to flip' : allOpened ? ' — all boosters opened!' : ''}
            </h3>
            <span className="spacer" />
            {!packDone && <button onClick={() => reveal(currentPack.length)}>Reveal booster</button>}
            {packDone && !lastPack && <button className="sealed-ready" onClick={nextBooster}>Next booster ▶</button>}
            {!allOpened && <button onClick={openAll} title="Reveal everything and hide this">🎴 Open all</button>}
            {allOpened && <button onClick={() => setBoosterHidden(true)}>Hide booster opening ▲</button>}
          </div>
          <div className="mullhand">
            {currentPack.map((name, i) => (
              <div
                key={i}
                className={`packcard ${i < revealed ? 'revealed' : 'facedown'}`}
                onClick={() => reveal(i + 1)}
                onMouseEnter={() => i < revealed && setHover(name)}
              >
                {i < revealed ? <CardImg name={name} className="handimg" /> : <CardBack kind={backKindFor(name)} className="cardback" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BELOW: the deck-builder grid, filling with the cards you've opened */}
      <div className="db-columns">
        <div className="db-search">
          <div className="db-filters">
            <input placeholder="search your pool…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">any type</option>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <select value={elemFilter} onChange={(e) => setElemFilter(e.target.value)}>
              <option value="">any element</option>
              {ELEMENTS.map((t) => <option key={t}>{t}</option>)}
            </select>
            <span className="db-hint">click a card to add it{total(openedPool) === 0 ? ' — open a booster above to fill this' : ''} · supplied cards are unlimited (∞)</span>
          </div>
          <div className="db-results">
            {results.map((c) => {
              const supplied = c.name === SEALED_SUPPLIED_AVATAR || isSuppliedSite(c.name)
              const rem = c.type === 'Avatar' ? (avatar === c.name ? 0 : 1) : remaining(c.name)
              return (
                <div
                  key={c.name}
                  className={`db-card${rem <= 0 && c.type !== 'Avatar' ? ' spent' : ''}`}
                  onMouseEnter={() => setHover(c.name)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => addCard(c)}
                >
                  <CardImg name={c.name} className="db-thumb" />
                  <span className="badge">{c.type === 'Avatar' ? '★' : supplied ? '∞' : `${rem}/${openedPool[c.name] ?? 0}`}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="db-deck">
          <h3>Avatar: {avatar ? avatar : <i>none</i>}</h3>
          <h3>Spellbook ({spellCount}/{MIN_SEALED_SPELLBOOK}+)</h3>
          {Object.entries(spellbook).sort(([a], [b]) => a.localeCompare(b)).map(([n, c]) => (
            <div key={n} className="db-row" onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}>
              <span>{c}× {n}</span>
              <button onClick={() => removeCard('spellbook', n)}>−</button>
            </div>
          ))}
          <h3>Atlas ({siteCount}/{MIN_SEALED_ATLAS}+)</h3>
          {Object.entries(atlas).sort(([a], [b]) => a.localeCompare(b)).map(([n, c]) => (
            <div key={n} className="db-row" onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}>
              <span>{c}× {n}{isSuppliedSite(n) ? ' ∞' : ''}</span>
              <button onClick={() => removeCard('atlas', n)}>−</button>
            </div>
          ))}
          <div className="db-problems">
            {problems.map((p, i) => <div key={i} className={p.level}>{p.msg}</div>)}
            {errors.length === 0 && <div className="okmsg">Deck is legal ✓ — click Ready</div>}
          </div>
        </div>

        <div className="db-preview">{hover && <CardHover name={hover} />}</div>
      </div>
    </div>
  )
}
