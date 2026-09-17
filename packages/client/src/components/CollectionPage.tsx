import { useMemo, useRef, useState } from 'react'
import { findCard } from '@sorcery/shared'
import {
  SETS,
  addPackToCollection,
  loadCollection,
  openPack,
  ownedCopies,
  type Collection,
  type PackCard,
  type SetName,
} from '../collection'
import CardImg, { CardHover, CardBack, backKindFor } from './CardImg'

export default function CollectionPage({ onBack }: { onBack: () => void }) {
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
        <div className="db-results" style={{ gridColumn: '1 / span 2' }}>
          {owned.map(([name, v]) => (
            <div key={name} className="db-card" onMouseEnter={() => setHover(name)}>
              <CardImg name={name} className="db-thumb" />
              <span className="badge">
                ×{v.std + v.foil + v.curio}
                {v.foil > 0 && ` ✨${v.foil}`}
                {v.curio > 0 && ` 🌟${v.curio}`}
              </span>
            </div>
          ))}
          {owned.length === 0 && <p>No cards yet — open a booster!</p>}
        </div>
        <div className="db-preview">{hover && <CardHover name={hover} />}</div>
      </div>
    </div>
  )
}

export { ownedCopies }
export type { Collection }
export const _findCard = findCard
