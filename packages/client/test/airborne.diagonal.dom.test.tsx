// With ground sites present, the client DOES offer an airborne minion its diagonal surface steps — both in
// the initial reachable highlight and in manual-stepping. (A diagonal to a siteless/void square is
// correctly NOT offered: a surface step needs a site to land on.)
import { describe, it, expect, afterEach } from 'vitest'
import { board, place, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })
const sq = (h: GameHarness, x: number, y: number) => h.container.querySelector(`.square[data-sq="${x},${y}"]`) as HTMLElement
const diag = (h: GameHarness) => [[1, 0], [3, 0], [1, 2], [3, 2]].every(([x, y]) => (sq(h, x, y)?.className ?? '').includes('hl-unitmove'))

function airborneBoard(): { g: GameState; id: string } {
  const g = board() as GameState; g.prompts = []
  for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) place(g, 0, 'Active Volcano', x, y)
  for (const s of Object.values(g.sites)) { s.controller = 0; s.isRubble = false }
  for (const u of Object.values(g.units)) if (u.controller === 1) delete g.units[u.id]
  const id = usummon(g, 0, 'Fine Courser', 2, 1)
  const u = g.units[id]; u.enteredTurn = -5; u.tapped = false; u.region = 'surface'
  u.modifiers.push({ kind: 'keyword', keyword: 'airborne' } as any)
  u.modifiers.push({ kind: 'keyword', keyword: 'movement +2' } as any)
  return { g, id }
}

describe('client offers airborne surface diagonals (with sites)', () => {
  it('highlights the four diagonal squares as reachable', () => {
    const { g, id } = airborneBoard()
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement)
    expect(diag(h), 'all four diagonal surface squares are reachable').toBe(true)
  })

  it('offers diagonal next-steps in manual-stepping mode', () => {
    const { g, id } = airborneBoard()
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement)
    h.click(sq(h, 2, 3)) // far dest with many routes → Auto/Manual prompt
    const howMove = h.container.querySelector('[data-modebanner="howMove"]')!
    expect(howMove, 'the Auto/Manual prompt appears').toBeTruthy()
    h.click(howMove.querySelector('[data-choice="manual"]') as HTMLElement); h.rerender()
    expect(diag(h), 'manual mode lights the diagonal first steps').toBe(true)
  })
})
