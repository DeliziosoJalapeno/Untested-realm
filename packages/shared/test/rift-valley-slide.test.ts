// Rift Valley: 'You may pull apart a partial row or column to make a void in which to play this.'
//
// The seam is allowed to sit at the run's own edge, so a WHOLE run of sites slides outward and the
// rift opens behind it. Insisting that a site stay behind made the card dead on the most ordinary
// board there is: one road down, nothing to "pull apart", nowhere to play.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, injectToHand, placeSite, summonCard, answer } from './helpers'
import { riftShifts } from '../src/cards/scripts/multi-card-utils/rift-entry'
import type { GameState, SiteState } from '../src'
import '../src/cards/scripts/index'

function siteAtXY(g: GameState, x: number, y: number): SiteState | undefined {
  return Object.values(g.sites).find((s) => s.x === x && s.y === y && !s.isRubble)
}
/** Play Rift Valley at (x,y), answering the direction prompt with the first label that matches. */
function playRift(g: GameState, x: number, y: number, want?: string): void {
  const id = injectToHand(g, 0, 'Rift Valley')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: id, x, y })
  const prompt = g.prompts[0]
  if (!prompt) return
  const options = (prompt.data?.options ?? []) as string[]
  answer(g, want ? options.find((o) => o.includes(want)) : options[0])
}

describe('Rift Valley pulls apart a line of any length', () => {
  it('opens a rift under a lone site by sliding it one square', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Imperial Road', 2, 2)
    expect(riftShifts(g, 2, 2).length, 'a single site is still a line that can be pulled apart').toBeGreaterThan(0)

    playRift(g, 2, 2, 'east')
    expect(siteAtXY(g, 3, 2)?.name, 'the road slid east').toBe('Imperial Road')
    expect(siteAtXY(g, 2, 2)?.name, 'Rift Valley landed in the void it opened').toBe('Rift Valley')
  })

  it('slides the whole run, not just part of it', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Imperial Road', 1, 2)
    placeSite(g, 0, 'Rustic Village', 2, 2)

    playRift(g, 1, 2, 'east')
    expect(siteAtXY(g, 2, 2)?.name, 'the road moved up the row').toBe('Imperial Road')
    expect(siteAtXY(g, 3, 2)?.name, 'and pushed its neighbour along with it').toBe('Rustic Village')
    expect(siteAtXY(g, 1, 2)?.name, 'the rift opened behind them').toBe('Rift Valley')
  })

  it('carries the units standing on the sliding sites', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Imperial Road', 1, 2)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const rider = summonCard(g, 0, 'Ogre Goons', 2, 2)

    playRift(g, 1, 2, 'east')
    expect([rider.x, rider.y], 'the unit travelled with the ground under it').toEqual([3, 2])
  })

  it('offers nothing along a line that is already full, and never pushes off the board', () => {
    const g = newGame() as GameState; keepBoth(g)
    // a FULL row is not a "partial row" — there is no slack in it to pull apart
    for (let x = 0; x < 5; x++) placeSite(g, 0, 'Rustic Village', x, 2)
    expect(riftShifts(g, 2, 2).filter((s) => s.axis === 'row'), 'a full row has no give').toEqual([])

    // whatever IS offered must land the leading site on an empty square inside the grid: a
    // partial line always has an open end, so the seam at its own extreme still has somewhere
    // to go — just never off the edge or onto another site.
    for (const shift of riftShifts(g, 2, 2)) {
      const lead = shift.cells[shift.cells.length - 1]
      const to = shift.axis === 'row' ? { x: lead.x + shift.dir, y: lead.y } : { x: lead.x, y: lead.y + shift.dir }
      expect(to.x, 'stays on the grid').toBeGreaterThanOrEqual(0)
      expect(to.y, 'stays on the grid').toBeGreaterThanOrEqual(0)
      expect(to.x).toBeLessThan(5)
      expect(to.y).toBeLessThan(4)
      expect(Object.values(g.sites).some((t) => t.x === to.x && t.y === to.y && !t.isRubble), 'slides into open ground').toBe(false)
    }
  })
})
