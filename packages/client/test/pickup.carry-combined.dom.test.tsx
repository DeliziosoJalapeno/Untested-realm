// Pick Up is once per turn, but that one Pick Up may take any mix of the artifacts and allies at the
// unit's location. The menu only offered "Pick up <artifact>" and "Carry <unit>" as separate buttons —
// each spending the unit's one Pick Up — so a War Horse could never take its Lance AND its rider in
// the same turn. "Pick up…" now lists the allies it can carry alongside the artifacts.
import { describe, it, expect, afterEach } from 'vitest'
import { board, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('one Pick Up takes artifacts and allies together', () => {
  it('a War Horse picks up a Lance and carries its rider in a single Pick Up', () => {
    const g = board() as GameState; g.prompts = []; g.phase = 'main'; g.activePlayer = 0
    const horse = usummon(g, 0, 'War Horse', 2, 1)
    g.units[horse].enteredTurn = -1; g.units[horse].tapped = false
    const rider = usummon(g, 0, 'Foot Soldier', 2, 1)
    const cardId = `ctest${g.nextId++}`
    g.cards[cardId] = { id: cardId, name: 'Lance', owner: 0 }
    const lance = `atest${g.nextId++}`
    g.artifacts[lance] = { id: lance, cardId, name: 'Lance', owner: 0, x: 2, y: 1, region: 'surface', carriedBy: null } as any

    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${horse}"]`) as HTMLElement)
    const pickup = h.container.querySelector(`[data-pickup-arts="${horse}"]`) as HTMLElement
    expect(pickup, 'a Pick up… button for the horse').toBeTruthy()
    h.click(pickup)
    h.click(h.container.querySelector(`[data-artchoice="${lance}"]`) as HTMLElement)
    h.click(h.container.querySelector(`[data-artchoice="${rider}"]`) as HTMLElement)
    h.click(h.container.querySelector('[data-promptbox="chooseArts"] [data-confirm="1"]') as HTMLElement)

    expect(h.state.units[horse].carrying).toEqual([lance])
    expect(h.state.units[horse].carryingUnits).toEqual([rider])
  })
})
