// Sites that let cards be cast to them "ignoring threshold":
//   - Den of Evil: Genesis → this turn the next EVIL cast here costs (1) less, ignoring threshold (one-shot).
//   - Dragonlord's Lair: DRAGONS cast here require no threshold and cost (1) less (continuous).
// Both previously discounted the cost but still ENFORCED the threshold. Also: Pathfinder plays
// sites straight from its atlas — those sites' Genesis abilities must fire (they were inserted raw).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, injectToHand } from './helpers'
import { ignoresThreshold, makeCtx, getScript, siteAt, boardWithAvatar } from '../src'

describe('site threshold waivers', () => {
  it('Dragonlord\'s Lair waives threshold for Dragons cast to it (and only Dragons)', () => {
    const g: any = newGame(); keepBoth(g)
    const lair = placeSite(g, 0, "Dragonlord's Lair", 1, 1)
    const dragon = injectToHand(g, 0, 'Ignis Rex') // a Unique Dragon; p0 has no threshold
    const notDragon = injectToHand(g, 0, 'Common Cottagers') // a Mortal
    expect(ignoresThreshold(g, 0, dragon, { x: lair.x, y: lair.y }), 'Dragon needs no threshold here').toBe(true)
    expect(ignoresThreshold(g, 0, notDragon, { x: lair.x, y: lair.y }), 'a non-Dragon still needs threshold').toBe(false)
    // and only AT the lair's square
    expect(ignoresThreshold(g, 0, dragon, { x: 3, y: 3 }), 'the waiver is location-bound').toBe(false)
  })

  it('Den of Evil waives threshold for the next Evil cast to it, once', () => {
    const g: any = newGame(); keepBoth(g)
    const den = placeSite(g, 0, 'Den of Evil', 1, 1)
    getScript('Den of Evil')!.genesis!(makeCtx(g, den.id, 0, [])) // Genesis fires on play → arms the waiver
    const evil = injectToHand(g, 0, 'Death Knight') // Undead ⇒ Evil; p0 has no Earth threshold
    const good = injectToHand(g, 0, 'Common Cottagers') // Mortal ⇒ not Evil
    expect(ignoresThreshold(g, 0, evil, { x: den.x, y: den.y }), 'Evil needs no threshold here').toBe(true)
    expect(ignoresThreshold(g, 0, good, { x: den.x, y: den.y }), 'a non-Evil card still needs threshold').toBe(false)
    // one-shot: once an Evil card is cast here the discount entry is spent (simulate consumption)
    g.flow.spellDiscounts = []
    expect(ignoresThreshold(g, 0, evil, { x: den.x, y: den.y }), 'the waiver is spent after the first Evil cast').toBe(false)
  })
})

describe('Pathfinder plays atlas sites through the normal entry path (their Genesis fires)', () => {
  it('a site Pathfinder blazes into play runs its Genesis', () => {
    const g: any = boardWithAvatar('Pathfinder')
    const av = g.units[g.players[0].avatarUnitId]
    av.x = 0; av.y = 0 // a corner with adjacent voids in the scaffold
    // put Den of Evil on top of the atlas
    const cardId = `cpf${g.nextId++}`
    g.cards[cardId] = { id: cardId, name: 'Den of Evil', owner: 0 }
    g.players[0].atlas.unshift(cardId)
    const spot = [[1, 0], [0, 1]].find(([x, y]) => !siteAt(g, x, y))!
    getScript('Pathfinder')!.conts!.blaze!(makeCtx(g, av.id, 0, []), null, { x: spot[0], y: spot[1] })
    // the site entered AND its Genesis fired (Den of Evil arms a spellDiscount at its square)
    expect(siteAt(g, spot[0], spot[1])?.name).toBe('Den of Evil')
    expect((g.flow.spellDiscounts ?? []).some((d: any) => d.evil && d.at?.x === spot[0] && d.at?.y === spot[1]),
      'the played site\'s Genesis ran').toBe(true)
    // and Pathfinder moved onto the new site
    expect(g.units[av.id].x).toBe(spot[0])
    expect(g.units[av.id].y).toBe(spot[1])
  })
})
