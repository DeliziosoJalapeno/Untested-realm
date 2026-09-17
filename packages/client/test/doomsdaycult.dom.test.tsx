// Doomsday Cult: while a live Cult is in play, each player's spellbook top is revealed in their player bar
// (📖 + a thumbnail). Your own top glows "castable" when it's an Evil minion you can take up to the Cult.
import { describe, it, expect, afterEach } from 'vitest'
import { board, usummon } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Doomsday Cult top-of-spellbook reveal in the player bar', () => {
  it('shows both players’ tops, and marks my Evil top castable', () => {
    const g = board() as any; g.prompts = []; g.phase = 'main'; g.activePlayer = 0
    // board() already gives player 0 mana + a threshold waiver and a site at (1,1); putting the Cult there
    // (a site I control) lets the Evil top actually be cast onto it → the top glows castable.
    const t0 = 'topA'; g.cards[t0] = { id: t0, name: 'Bone Jumble', owner: 0 }; g.players[0].spellbook.unshift(t0)
    const t1 = 'topB'; g.cards[t1] = { id: t1, name: 'Aethermoeba', owner: 1 }; g.players[1].spellbook.unshift(t1)
    usummon(g, 0, 'Doomsday Cult', 1, 1)

    const h = new GameHarness(g).mount(); active = h
    const tops = h.container.querySelectorAll('.revealedtop img')
    expect(tops.length, 'both spellbook tops are shown').toBe(2)
    expect(h.container.querySelector('.revealedtop.castable'), 'my Evil top glows castable').toBeTruthy()
  })

  it('shows nothing when no Cult is in play', () => {
    const g = board() as any; g.prompts = []; g.phase = 'main'; g.activePlayer = 0
    const t0 = 'topA'; g.cards[t0] = { id: t0, name: 'Bone Jumble', owner: 0 }; g.players[0].spellbook.unshift(t0)
    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('.revealedtop'), 'no reveal without a Cult').toBeFalsy()
  })
})
