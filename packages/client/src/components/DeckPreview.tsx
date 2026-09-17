import { useState } from 'react'
import type { DeckList } from '@sorcery/shared'
import CardImg, { CardHover } from './CardImg'

type Entry = [string, number]
const byName = (a: Entry, b: Entry) => a[0].localeCompare(b[0])
const sum = (es: Entry[]) => es.reduce((a, [, n]) => a + n, 0)

function Section({ title, cards, onHover }: { title: string; cards: Entry[]; onHover: (name: string) => void }) {
  if (!cards.length) return null
  return (
    <div className="dc-section">
      <h3>
        {title} <span className="dc-count">({sum(cards)})</span>
      </h3>
      <div className="dc-grid">
        {cards.map(([name, n]) => (
          <div key={name} className="dc-card" title={n > 1 ? `${name} ×${n}` : name}
            onMouseEnter={() => onHover(name)} onClick={() => onHover(name)}>
            <CardImg name={name} className="dc-thumb" />
            {n > 1 && <span className="dc-badge">×{n}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

/** A full-screen confirmation shown before a game starts: preview the chosen deck (avatar,
 *  spellbook, atlas, collection), SWITCH to a different deck from the list without going
 *  back, then Confirm or go Back. Works in both standard and mobile layouts. */
export default function DeckPreview({ deck, decks, onConfirm, onCancel }: {
  deck: DeckList
  decks: DeckList[]
  onConfirm: (chosen: DeckList) => void
  onCancel: () => void
}) {
  const [chosen, setChosen] = useState<DeckList>(deck)
  const [hover, setHover] = useState<string | null>(null)
  const spellbook = Object.entries(chosen.spellbook ?? {}).filter(([, n]) => n > 0).sort(byName)
  const atlas = Object.entries(chosen.atlas ?? {}).filter(([, n]) => n > 0).sort(byName)
  const collection = Object.entries(chosen.collection ?? {}).filter(([, n]) => n > 0).sort(byName)
  const pick = (id: string) => setChosen(decks.find((d) => (d.id ?? d.name) === id) ?? chosen)
  const chosenId = chosen.id ?? chosen.name
  return (
    <div className="deckconfirm" data-overlay="deckconfirm" role="dialog" aria-modal="true">
      <div className="dc-bar">
        <div className="dc-title">
          <label className="dc-pick">
            Deck{' '}
            <select data-deck-pick value={chosenId} onChange={(e) => pick(e.target.value)}>
              {decks.map((d) => (
                <option key={d.id ?? d.name} value={d.id ?? d.name}>{d.name}</option>
              ))}
            </select>
          </label>
          <span className="dc-sub">
            {sum(spellbook)} spells · {sum(atlas)} sites{collection.length ? ` · ${sum(collection)} collection` : ''}
          </span>
        </div>
        <div className="dc-actions">
          <button className="dc-cancel" data-cancel="1" onClick={onCancel}>← Back</button>
          <button className="dc-confirm" data-confirm="1" onClick={() => onConfirm(chosen)}>Confirm & Start ▶</button>
        </div>
      </div>
      {/* the grid and a RESERVED detail column sit side by side, so the preview never covers cards */}
      <div className="dc-main">
        <div className="dc-body">
          <div className="dc-section">
            <h3>Avatar</h3>
            <div className="dc-grid">
              {chosen.avatar ? (
                <div className="dc-card" title={chosen.avatar}
                  onMouseEnter={() => setHover(chosen.avatar!)} onClick={() => setHover(chosen.avatar!)}>
                  <CardImg name={chosen.avatar} className="dc-thumb" />
                </div>
              ) : (
                <i>none</i>
              )}
            </div>
          </div>
          <Section title="Spellbook" cards={spellbook} onHover={setHover} />
          <Section title="Atlas" cards={atlas} onHover={setHover} />
          <Section title="Collection" cards={collection} onHover={setHover} />
        </div>
        {/* card detail column: hover (desktop) or tap (mobile) a card to read it here */}
        <div className="dc-detail">
          {hover ? <CardHover name={hover} /> : <div className="dc-detail-empty">Hover or tap a card to preview it.</div>}
        </div>
      </div>
    </div>
  )
}
