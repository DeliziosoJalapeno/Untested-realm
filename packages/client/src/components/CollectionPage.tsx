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

export default function CollectionPage({ onBack }: { onBack: () => void }) {
  const { mobile } = useMobileMode() // no hover on touch → tap INSPECTS a card; Add is an explicit button
  const [collection, setCollection] = useState<Collection>(loadCollection())
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

  // Manually add / remove one copy via the search interface. Mutate a fresh clone OUTSIDE the
  // setState updater (StrictMode double-invokes updaters — see the applyAction purity rule).
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
        <span className="spacer" />
        <select value={set} onChange={(e) => setSet(e.target.value as SetName)}>
          {SETS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button onClick={crack}>🎴 Open a {set} booster</button>
      </div>

      {lastPack && (
        <div className="panel">
          <h3>
            Booster ({revealed}/{lastPack.length} revealed — click to flip)
            {revealed < lastPack.length && ' · cards join your collection as you reveal them'}
          </h3>
          <div className="mullhand">
            {lastPack.map((card, i) => (
              <div
                key={i}
                className={`packcard ${i < revealed ? 'revealed' : 'facedown'} finish-${card.finish}`}
                onClick={() => reveal(i + 1)}
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
          <button onClick={() => reveal(lastPack.length)}>Reveal all</button>
        </div>
      )}

      <div className="db-columns">
        {/* same search + filter grid the deck builder uses — click a card to add it to your collection */}
        <CardSearch
          onPick={(c) => addOne(c.name)}
          onHover={setHover}
          hovered={hover}
          mobile={mobile}
          collection={collection}
          showOwned
        />

        <div className="db-deck">
          <h3>Your cards ({totalOwned})</h3>
          <p className="db-hint">Click a card on the left to add a copy · click one below to remove a copy.</p>
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
            {owned.length === 0 && <p>No cards yet — open a booster or add cards on the left!</p>}
          </div>
        </div>

        <div className="db-preview">
          {mobile && hover && findCard(hover) && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <button className="db-mobile-add" onClick={() => addOne(hover)}>＋ Add</button>
              {ownedCopies(collection, hover) > 0 && <button className="db-mobile-add" onClick={() => removeOne(hover)}>− Remove</button>}
            </div>
          )}
          {hover && <CardHover name={hover} />}
        </div>
      </div>
    </div>
  )
}

export { ownedCopies }
export type { Collection }
export const _findCard = findCard
