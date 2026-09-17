import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import {
  createGame, starterDecks, applyAction, cinject, avatarOf,
  getScript, makeCtx, isBlanked, effKeywords, isDisabled, grantedAbilities, type GameState,
} from '../src'

/** a REAL game (the newGame() helper opts out of the forced first-turn site). */
function realGame(first: 0 | 1 = 0) {
  return createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 42, first)
}

function druidScript() {
  return getScript('Druid')!
}

describe('Druid — front: summons Tawny on the FORCED first-turn site (the reported bug)', () => {
  it('placing the obligatory first site auto-summons Tawny under the avatar', () => {
    const g = realGame(0)
    avatarOf(g, 0).name = 'Druid'
    const spire = cinject(g, 0, 'Spire')
    applyAction(g, 0, { t: 'keepHand' })
    applyAction(g, 1, { t: 'keepHand' })
    if (g.prompts[0]?.kind === 'drawDeck') applyAction(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: 'spellbook' })

    const pr = g.prompts[0]
    expect(pr?.kind, 'the Druid is still forced to establish a site').toBe('firstSite')
    applyAction(g, 0, { t: 'prompt', promptId: pr!.id, choice: spire })

    const av = avatarOf(g, 0)
    const tawny = Object.values(g.units).find((u) => u.name === 'Tawny' && u.controller === 0)
    expect(tawny, 'Tawny was summoned on the first site play').toBeTruthy()
    expect({ x: tawny!.x, y: tawny!.y }, 'Tawny appears under the avatar ("here")').toEqual({ x: av.x, y: av.y })
  })
})

describe('Druid — front: the Tawny rider only fires on your FIRST turn', () => {
  function afterSite(g: GameState, player: 0 | 1) {
    const av = avatarOf(g, player); av.name = 'Druid'
    placeSite(g, player, 'Spire', av.x, av.y)
    druidScript().afterAvatarSitePlay!(makeCtx(g, av.id, player, []), 'ignored')
  }
  it('summons Tawny on turn 1 (first player)', () => {
    const g = newGame(); keepBoth(g); g.turn = 1
    afterSite(g, 0)
    expect(Object.values(g.units).some((u) => u.name === 'Tawny' && u.controller === 0)).toBe(true)
  })
  it('does NOT summon Tawny on a later turn', () => {
    const g = newGame(); keepBoth(g); g.turn = 3
    afterSite(g, 0)
    expect(Object.values(g.units).some((u) => u.name === 'Tawny' && u.controller === 0)).toBe(false)
  })
  it('does not summon a second Tawny if one is already controlled', () => {
    const g = newGame(); keepBoth(g); g.turn = 1
    afterSite(g, 0)
    afterSite(g, 0) // a hypothetical second first-turn site play
    expect(Object.values(g.units).filter((u) => u.name === 'Tawny' && u.controller === 0).length).toBe(1)
  })
})

describe('Druid — front: the Bruin ability summons Bruin and FLIPS the card', () => {
  it('summons Bruin, sets flipped, and hides the front ability afterward', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    const av = avatarOf(g, 0); av.name = 'Druid'
    placeSite(g, 0, 'Spire', av.x, av.y)
    const script = druidScript()
    expect(script.abilities![0].available!(g, av.id), 'Bruin ability offered while unflipped').toBe(true)

    script.abilities![0].effect(makeCtx(g, av.id, 0, []))

    expect(av.flipped, 'the Druid flipped to its back side').toBe(true)
    expect(Object.values(g.units).some((u) => u.name === 'Bruin' && u.controller === 0)).toBe(true)
    expect(script.abilities![0].available!(g, av.id), 'the flip ability is gone once flipped').toBe(false)
  })
})

describe('Druid — flip side: nearby allied sites damage entering enemies (only when flipped)', () => {
  function setup() {
    const g = newGame(); keepBoth(g); g.turn = 5
    const av = avatarOf(g, 0); av.name = 'Druid'; av.x = 1; av.y = 1; av.region = 'surface'
    placeSite(g, 0, 'Spire', 2, 1) // an allied site adjacent to the avatar
    const foe = summonCard(g, 1, 'Ancient Dragon', 2, 1) // enters the nearby allied site
    return { g, av, foe }
  }
  it('unflipped: no damage', () => {
    const { g, av, foe } = setup()
    druidScript().onUnitEntersSquare!(makeCtx(g, av.id, 0, []), foe, { x: foe.x, y: foe.y, region: foe.region })
    expect(foe.damage).toBe(0)
  })
  it('flipped: the intruder takes 1 damage', () => {
    const { g, av, foe } = setup()
    av.flipped = true
    druidScript().onUnitEntersSquare!(makeCtx(g, av.id, 0, []), foe, { x: foe.x, y: foe.y, region: foe.region })
    expect(foe.damage).toBe(1)
  })
})

describe('Druid — flip side: FORCED entry (teleport / pull) also triggers the thorns', () => {
  it('a teleported enemy dragged onto a nearby allied site takes 1 damage (fires via emitUnitMoved)', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    const av = avatarOf(g, 0); av.name = 'Druid'; (av as any).flipped = true; av.x = 1; av.y = 1; av.region = 'surface'
    placeSite(g, 0, 'Spire', 2, 1) // allied site adjacent to the flipped Druid
    const foe = summonCard(g, 1, 'Stygian Archers', 4, 3); foe.enteredTurn = -1 // 3/3, survives 1 damage
    // a FORCED relocation (not a voluntary walk) onto the nearby allied site
    makeCtx(g, foe.id, 1, []).teleport(foe.id, 2, 1, 'surface')
    expect(g.units[foe.id]?.damage, 'forced entry still triggers the site thorns').toBe(1)
  })
})

describe('Vivien borrowing the Druid flip — she blanks out (FAQ)', () => {
  it('summons Bruin, flips, and becomes a do-nothing husk (no abilities/keywords, cannot act)', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    avatarOf(g, 0).name = 'Druid' // an avatar whose flip ability Vivien can borrow
    const vivien = summonCard(g, 0, 'Vivien the Enchantress', 1, 1)
    placeSite(g, 0, 'Spire', 1, 1)

    // before flipping, Vivien grants herself the Druid's Bruin/flip ability
    const before = grantedAbilities(g, vivien)
    expect(before.some((a) => a.key === 'bruin'), 'Vivien borrows the flip ability').toBe(true)

    // using it (the effect runs with Vivien as the source) summons Bruin and flips HER
    getScript('Druid')!.abilities![0].effect(makeCtx(g, vivien.id, 0, []))

    expect(vivien.flipped, 'Vivien flipped').toBe(true)
    expect(Object.values(g.units).some((u) => u.name === 'Bruin' && u.controller === 0)).toBe(true)
    // "a flipped card with nothing on the back" — blanked, no game text
    expect(isBlanked(vivien)).toBe(true)
    expect(Object.keys(effKeywords(g, vivien)).length, 'no keywords').toBe(0)
    expect(isDisabled(g, vivien), 'no longer a minion — cannot act').toBe(true)
    expect(grantedAbilities(g, vivien).some((a) => a.key === 'bruin'), 'she grants nothing anymore').toBe(false)
    // she still exists as a card on the board (can sit in the void, etc.)
    expect(g.units[vivien.id]).toBeTruthy()
  })
})

describe('Imposter masked as Druid — the flip option is denied (FAQ)', () => {
  it('a masked Imposter is NOT offered the Bruin/flip ability', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    const imp = avatarOf(g, 0); imp.name = 'Imposter'
    g.flow = { ...(g.flow ?? {}), imposterMask: { 0: 'Druid' } as any }

    const abilities = grantedAbilities(g, imp)
    expect(abilities.some((a) => a.key === 'bruin'), 'the self-flip ability is filtered out').toBe(false)
  })
})
