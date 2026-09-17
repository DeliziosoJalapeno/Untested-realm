import { useState } from 'react'
import type { PlayerId, PlayerView } from '@sorcery/shared'
import CardImg from './CardImg'

// Earthquake's rearrangement UI. The engine hands us the 2x2 area's cells (each with its current
// site + whether it may move) and just wants a final permutation back. Here the "swaps" are purely
// a way to author that permutation: click two movable cells to swap their occupants, as many times
// as you like, then Confirm — we send the resulting placement map in one shot. Each site carries its
// on-board contents (units/artifacts) with it (engine applyPermutation), which we show on the tile.
type Cell = { x: number; y: number; name: string | null; movable: boolean }

// Lay the four cells out exactly as they appear on the board for THIS viewer: columns run left→right
// and rows top→bottom in board orientation (flipped for the second seat). Falls back to the given
// order for a Magellan-wrapped area (coords aren't a tidy adjacent 2x2). The permutation answer is
// unaffected — every cell keeps its real (x,y), we only change where it's drawn.
export function orderForDisplay(cells: Cell[], flip: boolean): Cell[] {
  if (cells.length !== 4) return cells
  const xs = [...new Set(cells.map((c) => c.x))]
  const ys = [...new Set(cells.map((c) => c.y))]
  if (xs.length !== 2 || ys.length !== 2) return cells
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  if (maxX - minX !== 1 || maxY - minY !== 1) return cells // wrapped area → leave as-is
  const slot = (c: Cell) => {
    const col = flip ? maxX - c.x : c.x - minX      // board: x increases left→right (reversed when flipped)
    const row = flip ? c.y - minY : maxY - c.y      // board: higher y is nearer the top (reversed when flipped)
    return row * 2 + col
  }
  return [...cells].sort((a, b) => slot(a) - slot(b))
}

export function QuakeArrange({
  data,
  view,
  me,
  flip,
  onAnswer,
  onHover,
  style,
  handleProps,
}: {
  data: { cells?: Cell[] }
  view: PlayerView
  me: PlayerId
  flip: boolean
  onAnswer: (choice: { placements: { x: number; y: number; sx: number; sy: number }[] }) => void
  onHover?: (name: string) => void
  style?: React.CSSProperties
  handleProps?: any
}) {
  const cells: Cell[] = orderForDisplay(data.cells ?? [], flip)
  // arrangement[i] = index of the cell whose site currently sits at display position i (identity to start)
  const [arr, setArr] = useState<number[]>(() => cells.map((_, i) => i))
  const [pick, setPick] = useState<number | null>(null)

  // the normal-size contents that travel WITH the site at a given board square (units in any region +
  // loose artifacts) — mirrors the engine's applyPermutation capture, so the preview matches the result.
  const occupantsAt = (x: number, y: number): { id: string; name: string; mine: boolean }[] => {
    const out: { id: string; name: string; mine: boolean }[] = []
    for (const u of Object.values(view.units) as any[]) {
      if (u.x === x && u.y === y && !u.carriedBy) out.push({ id: u.id, name: u.name, mine: u.controller === me })
    }
    for (const a of Object.values(view.artifacts) as any[]) {
      if (!a.carriedBy && a.x === x && a.y === y) out.push({ id: a.id, name: a.name, mine: a.conjuredBy === me })
    }
    return out
  }

  const dirty = arr.some((src, i) => src !== i)
  function clickPos(i: number) {
    if (!cells[i]?.movable) return // fixed square (immovable site) — can't move it
    if (pick === null) { setPick(i); return }
    if (pick === i) { setPick(null); return }
    if (!cells[arr[i]]?.movable || !cells[arr[pick]]?.movable) { setPick(null); return }
    const next = arr.slice()
    ;[next[i], next[pick]] = [next[pick], next[i]]
    setArr(next)
    setPick(null)
  }
  function confirm() {
    onAnswer({ placements: cells.map((c, i) => ({ x: c.x, y: c.y, sx: cells[arr[i]].x, sy: cells[arr[i]].y })) })
  }

  return (
    <div className="modal quakearrange" style={style} data-promptbox="sitePermutation">
      <h3 {...handleProps}>Earthquake: rearrange the sites</h3>
      <p>Click two squares to swap them (their sites and everything on them move together). Repeat as you like, then Confirm.</p>
      <div className="quakegrid">
        {cells.map((c, i) => {
          const occ = cells[arr[i]] // the site (and its contents) currently assigned to this position
          const occupants = occ.name ? occupantsAt(occ.x, occ.y) : []
          return (
            <div
              key={`${c.x},${c.y}`}
              data-quakecell={`${c.x},${c.y}`}
              className={`quakecell${pick === i ? ' picked' : ''}${!c.movable ? ' fixed' : ''}${arr[i] !== i ? ' moved' : ''}`}
              title={occ.name ?? 'void'}
              onMouseEnter={() => onHover?.(occ.name ?? '')}
              onClick={() => clickPos(i)}
            >
              <div className="quaketile">
                {occ.name ? <CardImg name={occ.name} className="quakesiteimg" /> : <span className="quakevoid">void</span>}
                {occupants.length > 0 && (
                  <div className="quakeocc">
                    {occupants.slice(0, 8).map((o) => (
                      <CardImg key={o.id} name={o.name} className={`quakeocc-thumb ${o.mine ? 'mine' : 'theirs'}`} />
                    ))}
                    {occupants.length > 8 && <span className="quakeocc-more">+{occupants.length - 8}</span>}
                  </div>
                )}
              </div>
              <span className="quakecoord">({c.x + 1},{c.y + 1})</span>
              {!c.movable && <span className="quakelock" title="immovable">🔒</span>}
            </div>
          )
        })}
      </div>
      <button data-confirm="1" onClick={confirm}>{dirty ? 'Confirm arrangement' : 'Leave as is'}</button>
      {dirty && <button data-reset="1" onClick={() => { setArr(cells.map((_, i) => i)); setPick(null) }}>Reset</button>}
    </div>
  )
}
