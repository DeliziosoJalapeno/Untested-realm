// Mimic: "As you summon this Mimic, you may transform a carriable artifact into it, under your
// control." Cast with extra.mimicArtifact — the Mimic materializes at that artifact's location under
// the CASTER's control (even an enemy's / carried one) and the artifact is consumed. Monuments and
// Automatons aren't carriable and can't be transformed.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, injectToHand, giveMana, waiveThreshold, act, actFail, summonCard } from './helpers'
import { isCarriableArtifact, avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

function putGroundArtifact(g: GameState, name: string, owner: 0 | 1, x: number, y: number): string {
  const cardId = `ca${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner }
  const id = `a${g.nextId++}`
  ;(g.artifacts as any)[id] = { id, cardId, name, conjuredBy: owner, x, y, region: 'surface', carriedBy: null, tapped: false }
  return id
}

describe('isCarriableArtifact', () => {
  it('excludes Monuments and Automatons, includes ordinary artifacts', () => {
    expect(isCarriableArtifact('Meat Hook')).toBe(true)      // Weapon
    expect(isCarriableArtifact('The Immortal Throne')).toBe(false) // Monument
  })
})

describe('Mimic transforms a carriable artifact into itself under the caster', () => {
  function castMimicOn(g: GameState, artId: string) {
    const mimic = injectToHand(g, 0, 'Mimic')
    giveMana(g, 0, 12); waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: mimic, casterId: avatarOf(g, 0).id, at: { x: 0, y: 0 }, extra: { mimicArtifact: artId } } as any)
  }

  it('devours an ENEMY ground artifact, appears at its square under YOUR control, and banishes the card', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const artId = putGroundArtifact(g, 'Meat Hook', 1, 2, 2) // the OPPONENT's artifact
    const cardId = g.artifacts[artId].cardId
    castMimicOn(g, artId)

    expect(g.artifacts[artId], 'the artifact is consumed').toBeUndefined()
    const mimic = Object.values(g.units).find((u) => u.name === 'Mimic')!
    expect(mimic, 'a Mimic entered the realm').toBeTruthy()
    expect(mimic.x === 2 && mimic.y === 2, 'at the transformed artifact’s square').toBe(true)
    expect(mimic.controller, 'under the caster’s control').toBe(0)
    expect(g.players[1].banished, 'the enemy’s artifact card is banished').toContain(cardId)
  })

  it('can devour a CARRIED artifact, pulling it off its carrier', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 1)
    const carrier = summonCard(g, 1, 'Escyllion Cyclops', 3, 1); carrier.enteredTurn = -1
    const artId = putGroundArtifact(g, 'Meat Hook', 1, 3, 1)
    g.artifacts[artId].carriedBy = carrier.id
    carrier.carrying.push(artId)

    const mimic = injectToHand(g, 0, 'Mimic')
    giveMana(g, 0, 12); waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: mimic, casterId: avatarOf(g, 0).id, at: { x: 0, y: 0 }, extra: { mimicArtifact: artId } } as any)

    expect(g.artifacts[artId], 'the carried artifact is consumed').toBeUndefined()
    expect(carrier.carrying.includes(artId), 'it is pulled off its carrier').toBe(false)
    const mimicU = Object.values(g.units).find((u) => u.name === 'Mimic')!
    expect(mimicU.x === 3 && mimicU.y === 1 && mimicU.controller === 0, 'Mimic lands at the carrier’s square under the caster').toBe(true)
  })

  it('cannot transform a Monument (not carriable)', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const artId = putGroundArtifact(g, 'The Immortal Throne', 0, 2, 2)
    const mimic = injectToHand(g, 0, 'Mimic')
    giveMana(g, 0, 12); waiveThreshold(g, 0)
    const err = actFail(g, 0, { t: 'castSpell', cardId: mimic, casterId: avatarOf(g, 0).id, at: { x: 0, y: 0 }, extra: { mimicArtifact: artId } } as any)
    expect(err, 'the cast is rejected').toMatch(/transform/i)
    expect(g.artifacts[artId], 'the Monument survives').toBeTruthy()
  })
})
