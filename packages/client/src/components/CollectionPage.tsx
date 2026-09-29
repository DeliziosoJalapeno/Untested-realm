import { useMemo, useRef, useState } from 'react'
import { findCard } from '@sorcery/shared'
import {
  SETS,
  addCardToCollection,
  addPackToCollection,
  loadCollection,
  openPack,
  ownedCopies,
  removeCardFromCollection,
  type Collection,
  type PackCard,
  type SetName,
} from '../collection'
import { useMobileMode } from '../mobile'
import CardImg, { CardHover, CardBack, backKindFor } from './CardImg'
import CardSearch from './CardSearch'

type TopMode = 'booster' | 'add'

export default function CollectionPage({ onBack }: { onBack: () => void }) {
  const { mobile } = useMobileMode() // no hover on touch → tap INSPECTS a card; Add is an explicit button
  const [collection, setCollection] = useState<Collection>(loadCollection())
  const [mode, setMode] = useState<TopMode>('booster') // upper part: open a booster, or add single cards
  const [set, setSet] = useState<SetName>('Alpha')
  const [lastPack, setLastPack] = useState<PackCard[] | null>(null)
  const [revealed, setRevealed] = useState(0)
  const [hover, setHover] = useState<string | null>(null)
  // A freshly opened pack is held here and does NOT enter the collection (nor the
  // grid below) until its cards are actually revealed. committedRef guards against
  // adding the same pack twice.
  const committedRef = useRef(false)

  const owned = useMemo(
    () =>
      Object.entries(collection.cards)
        .filter(([, v]) => v.std + v.foil + v.curio > 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    [collection],
  )
  const totalOwned = owned.reduce((a, [, v]) => a + v.std + v.foil + v.curio, 0)

  // Commit the currently-open pack into the collection (once). Mutate OUTSIDE the
  // setState updater — React StrictMode double-invokes updaters, which would double
  // the localStorage/account writes (see the applyAction purity rule).
  function commitPack() {
    if (!lastPack || committedRef.current) return
    committedRef.current = true
    const next = { ...collection, cards: { ...collection.cards } }
    addPackToCollection(next, lastPack)
    setCollection(next)
  }

  function crack() {
    commitPack() // keep any pack you already opened before cracking the next
    committedRef.current = false
    setLastPack(openPack(set))
    setRevealed(0)
  }

  // Flip cards up to index n; the pack joins your collection once fully revealed.
  function reveal(n: number) {
    if (!lastPack) return
    const r = Math.min(lastPack.length, Math.max(revealed, n))
    setRevealed(r)
    if (r >= lastPack.length) commitPack()
  }

  // Manually add / remove one copy. Mutate a fresh clone OUTSIDE the setState updater
  // (StrictMode double-invokes updaters — see the applyAction purity rule).
  function addOne(name: string) {
    const next = { ...collection, cards: { ...collection.cards, [name]: { ...(collection.cards[name] ?? { std: 0, foil: 0, curio: 0 }) } } }
    addCardToCollection(next, name)
    setCollection(next)
  }
  function removeOne(name: string) {
    if (ownedCopies(collection, name) === 0) return
    const next = { ...collection, cards: { ...collection.cards, [name]: { ...(collection.cards[name] ?? { std: 0, foil: 0, curio: 0 }) } } }
    removeCardFromCollection(next, name)
    setCollection(next)
  }

  return (
    <div className="deckbuilder">
      <div className="db-toolbar">
        <button onClick={() => { commitPack(); onBack() }}>← Back</button>
        <b>Collection</b>
        <span>
          {totalOwned} cards · {collection.packsOpened} packs opened
          {collection.ripped > 0 && ` · ✂ ${collection.ripped} Erik's Curiosa ripped forever`}
        </span>
      </div>

      {/* UPPER PART: two ways to grow your collection — open a booster, or add single cards.
          The card panel is a full-height right column, so it starts up at the tabs and stays large. */}
      <div className="cp-top">
        <div className="cp-top-body">
          <div className="cp-left">
          <div className="db-tabs cp-modes">
            <button className={mode === 'booster' ? 'active' : ''} onClick={() => setMode('booster')}>Boosters</button>
            <button className={mode === 'add' ? 'active' : ''} onClick={() => setMode('add')}>＋ Add cards</button>
          </div>
          <div className="cp-modality">
            {mode === 'booster' ? (
              <>
                <div className="cp-boosterbar">
                  <select value={set} onChange={(e) => setSet(e.target.value as SetName)}>
                    {SETS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button onClick={crack}>🎴 Open a {set} booster</button>
                </div>
                {lastPack && (
                  <>
                    <p className="db-hint">
                      Booster ({revealed}/{lastPack.length} revealed — click a card to flip)
                      {revealed < lastPack.length && ' · they join your collection as you reveal them'}
                    </p>
                    <div className="mullhand">
                      {lastPack.map((card, i) => (
                        <div
                          key={i}
                          className={`packcard ${i < revealed ? 'revealed' : 'facedown'} finish-${card.finish}`}
                          onClick={() => { if (i < revealed) setHover(card.name); else reveal(i + 1) }}
                          onMouseEnter={() => i < revealed && setHover(card.name)}
                        >
                          {i < revealed ? (
                            <>
                              <CardImg name={card.name} className="handimg" />
                              {card.finish !== 'std' && <span className={`finishtag ${card.finish}`}>{card.finish === 'foil' ? '✨ FOIL' : '🌟 CURIO'}</span>}
                            </>
                          ) : (
                            <CardBack kind={backKindFor(card.name)} className="cardback" />
                          )}
                        </div>
                      ))}
                    </div>
                    {revealed < lastPack.length && <button onClick={() => reveal(lastPack.length)}>Reveal all</button>}
                  </>
                )}
              </>
            ) : (
              // the deck builder's card search — click a result to add one copy to your collection
              <CardSearch onPick={(c) => addOne(c.name)} onHover={setHover} hovered={hover} mobile={mobile} collection={collection} showOwned />
            )}
          </div>
          </div>{/* cp-left */}

          {/* card panel — fed by BOTH modes (and by the collection below) */}
          <div className="db-preview cp-preview">
            {mobile && hover && findCard(hover) && (
              <div className="cp-mobilebtns">
                <button className="db-mobile-add" onClick={() => addOne(hover)}>＋ Add</button>
                {ownedCopies(collection, hover) > 0 && <button className="db-mobile-add" onClick={() => removeOne(hover)}>− Remove</button>}
              </div>
            )}
            {hover ? <CardHover name={hover} /> : <p className="db-hint">Hover a card to see it here.</p>}
          </div>
        </div>
      </div>

      {/* LOWER PART: your collection, and only your collection. */}
      <div className="cp-collection">
        <h3>Your cards ({totalOwned})</h3>
        {owned.length > 0 && <p className="db-hint">Hover to inspect · click a card to remove one copy.</p>}
        <div className="db-results">
          {owned.map(([name, v]) => (
            <div
              key={name}
              className="db-card"
              title="Click to remove one copy"
              onMouseEnter={() => setHover(name)}
              onClick={mobile ? () => setHover(name) : () => removeOne(name)}
            >
              <CardImg name={name} className="db-thumb" />
              <span className="badge">
                ×{v.std + v.foil + v.curio}
                {v.foil > 0 && ` ✨${v.foil}`}
                {v.curio > 0 && ` 🌟${v.curio}`}
              </span>
            </div>
          ))}
          {owned.length === 0 && <p>No cards yet — open a booster or add cards above!</p>}
        </div>
      </div>
    </div>
  )
}

export { ownedCopies }
export type { Collection }
export const _findCard = findCard
