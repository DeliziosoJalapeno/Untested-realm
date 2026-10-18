// The Dragonlord's set-aside Unique Dragon is shown small (like a carried artifact) inside the avatar
// card — for BOTH players: it's public ("a rules reference for both players", FAQ).
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Dragonlord set-aside dragon in the avatar card', () => {
  it("shows each Dragonlord's set-aside dragon — yours and the opponent's", () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const opp = (1 - me) as 0 | 1
    // both avatars are Dragonlords; each set aside a dragon
    for (const pid of [me, opp]) {
      const av = g.units[g.players[pid].avatarUnitId]
      av.name = 'Dragonlord'; g.cards[av.cardId].name = 'Dragonlord'
    }
    g.flow = { ...(g.flow ?? {}), dragonlordPick: { [me]: 'Ignis Rex', [opp]: 'Caelestis' } }

    const h = new GameHarness(g).mount(); active = h

    // my Dragonlord shows MY set-aside dragon
    const mine = h.container.querySelector('.unit.mine.avatar [data-dragon-aside]') as HTMLElement
    expect(mine, 'my avatar shows the set-aside dragon').toBeTruthy()
    expect(mine.getAttribute('data-dragon-aside')).toBe('Ignis Rex')

    // …and the opponent's Dragonlord shows THEIR set-aside dragon
    const theirs = h.container.querySelector('.unit.theirs.avatar [data-dragon-aside]') as HTMLElement
    expect(theirs, "the opponent's set-aside dragon is shown").toBeTruthy()
    expect(theirs.getAttribute('data-dragon-aside')).toBe('Caelestis')
  })
})
