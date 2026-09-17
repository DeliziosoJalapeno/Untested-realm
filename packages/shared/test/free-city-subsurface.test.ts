// Free City ("may attack or defend against enemy units here") is a SITE, so its "here" spans its
// subsurface: it can reach DOWN to attack a burrowed/submerged enemy beneath it. Only the DEFEND half
// is surface-only (the walls shield allies standing atop it). The engine's `allowSubsurface` attack
// option is what a site-sourced attacker uses; ordinary surface units still can't strike down.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx, beginAttack, type GameState } from '../src'
import '../src/cards/scripts/index'

const burrow = (g: GameState, u: any) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'burrowing', duration: 'permanent', turn: g.turn, sourcePlayer: u.controller })

describe('attacking down into the subsurface', () => {
  it('a plain surface unit cannot strike a burrowed enemy at its square — unless allowSubsurface', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const attacker = summonCard(g, 0, 'Escyllion Cyclops', 2, 2); attacker.enteredTurn = -1
    const buried = summonCard(g, 1, 'Bone Jumble', 2, 2, 'underground'); buried.enteredTurn = -1; burrow(g, buried)

    expect(beginAttack(g, attacker, { unit: buried.id }), 'ordinary surface attacker cannot reach the subsurface').toBeTruthy()
    expect(beginAttack(g, attacker, { unit: buried.id }, { allowSubsurface: true }), 'a site-sourced attack may reach down').toBeNull()
  })
})

describe('Free City', () => {
  it('offers a burrowed enemy beneath it as an attack target', () => {
    const g = newGame() as GameState; keepBoth(g)
    const city = placeSite(g, 0, 'Free City', 2, 2)
    const buried = summonCard(g, 1, 'Bone Jumble', 2, 2, 'underground'); buried.enteredTurn = -1; burrow(g, buried)

    getScript('Free City')!.abilities![0].effect(makeCtx(g, city.id, 0, []))
    const prompt = g.prompts[0]
    expect(prompt, 'the city musters an attack').toBeTruthy()
    expect((prompt.data as any).candidates, 'the burrowed enemy under the city is a valid target').toContain(buried.id)
  })

  it('does NOT rise to defend a burrowed ally (defend is surface-only)', () => {
    const g = newGame() as GameState; keepBoth(g)
    const city = placeSite(g, 0, 'Free City', 2, 2)
    const ally = summonCard(g, 0, 'Bone Jumble', 2, 2, 'underground'); ally.enteredTurn = -1; burrow(g, ally)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2); foe.enteredTurn = -1

    getScript('Free City')!.onUnitAttacked!(makeCtx(g, city.id, 0, []), ally, foe)
    expect(Object.values(g.units).some((u) => u.name === 'Free City'), 'no city defender rises for a subsurface ally').toBe(false)
  })
})
