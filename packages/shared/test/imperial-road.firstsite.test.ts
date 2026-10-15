// Imperial Road "Genesis → Target opponent, then you, may play a site adjacent to this one." Its
// Genesis must fire even when the road is played as the FORCED first-turn site — and the OPPONENT is
// offered first (per the card), then the controller. Verified for both the first and second player.
import { describe, it, expect } from 'vitest'
import { createGame, starterDecks, applyAction, cinject } from '../src'

const realGame = (first: 0 | 1 = 0) => createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 42, first)
const clearDraw = (g: any, p: 0 | 1) => { if (g.prompts[0]?.kind === 'drawDeck') applyAction(g, p, { t: 'prompt', promptId: g.prompts[0].id, choice: 'spellbook' }) }

describe('Imperial Road played as the forced first site', () => {
  it('fires its Genesis and offers the OPPONENT first, then the controller', () => {
    const g = realGame(0)
    const road = cinject(g, 0, 'Imperial Road')
    cinject(g, 1, 'Spire') // the opponent has a site it could place
    applyAction(g, 0, { t: 'keepHand' })
    applyAction(g, 1, { t: 'keepHand' })
    clearDraw(g, 0)

    // player 0's forced first site = Imperial Road
    applyAction(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: road })
    expect(Object.values(g.sites).some((s) => s.name === 'Imperial Road')).toBe(true)

    // the Genesis fired: the OPPONENT (player 1) is offered first — and it blocks player 0 from acting
    const offer = g.prompts[0]
    expect(offer?.kind).toBe('yesNo')
    expect(offer?.player).toBe(1)
    expect(offer?.title).toMatch(/adjacent to the Imperial Road/i)
    expect(applyAction(g, 0, { t: 'endTurn' }).ok, 'a pending opponent prompt blocks player 0').toBe(false)

    // opponent declines → the controller (player 0) then gets their own offer
    applyAction(g, 1, { t: 'prompt', promptId: offer!.id, choice: false })
    const mine = g.prompts.find((p: any) => p.player === 0 && /Imperial Road/i.test(p.title))
    expect(mine, 'then YOU may play a site adjacent to the road').toBeTruthy()
  })

  it('also fires when the SECOND player plays it as their first site', () => {
    const g = realGame(0)
    const s0 = cinject(g, 0, 'Spire')
    const road = cinject(g, 1, 'Imperial Road')
    cinject(g, 0, 'Floodplain') // opponent (p0) has a site to be offered
    applyAction(g, 0, { t: 'keepHand' })
    applyAction(g, 1, { t: 'keepHand' })
    clearDraw(g, 0)
    applyAction(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: s0 })
    applyAction(g, 0, { t: 'endTurn' })
    clearDraw(g, 1)

    applyAction(g, 1, { t: 'prompt', promptId: g.prompts[0].id, choice: road }) // p1's forced first site
    expect(Object.values(g.sites).some((s) => s.name === 'Imperial Road')).toBe(true)
    const offer = g.prompts[0]
    expect(offer?.kind).toBe('yesNo')
    expect(offer?.player).toBe(0) // the opponent is offered first
  })
})
