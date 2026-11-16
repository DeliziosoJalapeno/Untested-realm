// Sissi Marksmen "may shoot across the top and bottom edges": in shoot mode the Ranged belt continues
// across the edge onto the far row — but only when the engine would actually offer that shot
// (rangedAcrossOffered: a north/south shot that misses on this side and would hit something across).
import { describe, it, expect, afterEach } from 'vitest'
import { board, usummon, type GameState, type PlayerId } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function site(g: GameState, p: PlayerId, x: number, y: number): void {
  const cardId = `csite${x}${y}`
  g.cards[cardId] = { id: cardId, name: 'Rustic Village', owner: p } as any
  g.sites[`ssite${x}${y}`] = { id: `ssite${x}${y}`, cardId, name: 'Rustic Village', owner: p, controller: p, x, y, tapped: false, isRubble: false } as any
}

/** Sissi at the top of column 0 (or the bottom, for seat 1), a site at both ends of the column */
function sissiBoard(seat: PlayerId, target: boolean): { g: GameState; id: string } {
  const g = board() as any
  site(g, 0, 0, 0); site(g, 0, 0, 3)
  const [from, to] = seat === 0 ? [3, 0] : [0, 3]
  const id = usummon(g, seat, 'Sissi Marksmen', 0, from)
  g.units[id].enteredTurn = -5
  if (target) usummon(g, (1 - seat) as PlayerId, 'Bone Jumble', 0, to)
  if (seat === 1) { g.activePlayer = 1; g.players[1].mana += 50 }
  return { g, id }
}

const belt = (h: GameHarness, x: number, y: number) => h.container.querySelector(`.square[data-sq="${x},${y}"] .belt:not(.belt-origin)`)

function shootMode(h: GameHarness, id: string): void {
  h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement)
  h.click(h.container.querySelector(`[data-ability="ranged"][data-source="${id}"]`) as HTMLElement)
}

describe('Sissi Marksmen wrapped Ranged belt', () => {
  it('draws the lane across the top edge onto the bottom row when the shot would hit there', () => {
    const { g, id } = sissiBoard(0, true)
    const h = new GameHarness(g).mount(); active = h
    shootMode(h, id)
    const across = belt(h, 0, 0)
    expect(across, 'the far-row square across the edge has a chevron').toBeTruthy()
    expect(across?.className, 'still flying north (up on seat 0’s unflipped board)').toContain('belt-up')
  })

  it('no wrapped lane when nothing is across the edge (the engine would not offer it)', () => {
    const { g, id } = sissiBoard(0, false)
    const h = new GameHarness(g).mount(); active = h
    shootMode(h, id)
    expect(h.container.querySelectorAll('.square[data-sq="0,3"] .belt.belt-origin').length, 'shoot mode is on').toBe(4)
    expect(belt(h, 0, 0)).toBeFalsy()
  })

  it('an ordinary Ranged unit gets no wrapped lane', () => {
    const { g } = sissiBoard(0, true)
    const archers = usummon(g, 0, 'Stygian Archers', 0, 3)
    const sissi = Object.values(g.units).find((u) => u.name === 'Sissi Marksmen')!
    delete g.units[sissi.id]
    g.units[archers].enteredTurn = -5
    const h = new GameHarness(g).mount(); active = h
    shootMode(h, archers)
    expect(belt(h, 0, 0)).toBeFalsy()
  })

  it('seat 1 (flipped board): shooting south wraps onto the top row, drawn with that seat’s orientation', () => {
    const { g, id } = sissiBoard(1, true)
    const h = new GameHarness(g).mount(); active = h
    shootMode(h, id)
    const across = belt(h, 0, 3)
    expect(across, 'the square across the bottom edge has a chevron').toBeTruthy()
    expect(across?.className, 'south reads as up on seat 1’s flipped board').toContain('belt-up')
  })
})
