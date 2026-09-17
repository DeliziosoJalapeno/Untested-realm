// Sir Tom Thumb — "May be carried by any Beast." A Beast (which has no carry-units ability of its own)
// standing on his square must still show a "Carry Sir Tom Thumb" button — the cargo invites itself onto
// any Beast, allied OR enemy. The carry list used to only consider the carrier's own carryUnits spec.
import { describe, it, expect, afterEach } from 'vitest'
import { board, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Sir Tom Thumb carry button on a Beast', () => {
  it('a Beast offers to carry a co-located Sir Tom Thumb — allied and enemy', () => {
    const g = board() as GameState; g.prompts = []; g.phase = 'main'; g.activePlayer = 0
    const beast = usummon(g, 0, 'Autumn Unicorn', 2, 1) // a Beast with NO carryUnits ability of its own
    g.units[beast].enteredTurn = -1; g.units[beast].tapped = false
    const mine = usummon(g, 0, 'Sir Tom Thumb', 2, 1)
    const foe = usummon(g, 1, 'Sir Tom Thumb', 2, 1)

    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${beast}"]`) as HTMLElement)
    expect(h.container.querySelector(`[data-carry="${mine}"]`), 'carry button for my Sir Tom Thumb').toBeTruthy()
    expect(h.container.querySelector(`[data-carry="${foe}"]`), 'carry button for the enemy Sir Tom Thumb too').toBeTruthy()
  })
})
