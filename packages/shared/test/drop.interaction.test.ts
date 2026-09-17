import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, giveMana, waiveThreshold, act, answer, castMagic } from './helpers'
import { drop } from '../src'

// Drop basic ability (rulebook): "Once on your turn, if this unit hasn't interacted with the
// realm, it may drop any number of artifacts it's carrying." Interacting = striking, dealing
// damage, casting a spell, or activating a special ability. Moving (even if it ends adjacent
// to enemies) does NOT interact — only an INTERCEPTED move strikes. So: attack/cast/ability →
// can't drop; a plain unintercepted move → can still drop.

describe('Drop requires the carrier hasn\'t interacted with the realm this turn', () => {
  it('a carrier that has done nothing may drop', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const u = summonCard(g, 0, 'Brown Bears', 2, 2)
    const art = giveArtifact(g, u, 'Ruby Core')
    expect(drop(g, 0, u.id, [art.id]), 'idle carrier may drop').toBeNull()
    expect(g.artifacts[art.id].carriedBy, 'artifact is now on the ground').toBeNull()
  })

  it('a carrier that ATTACKED this turn cannot drop', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const atk = summonCard(g, 0, 'Brown Bears', 2, 2) // 4 power — survives the fight
    const art = giveArtifact(g, atk, 'Ruby Core')
    summonCard(g, 1, 'Foot Soldiers', 2, 2) // enemy SHARING the square = combat (attacks move onto the target)
    const foe = Object.values(g.units).find((u) => u.controller === 1 && u.name === 'Foot Soldiers')!
    act(g, 0, { t: 'moveAttack', unitId: atk.id, path: [], attack: { unit: foe.id } })
    while (g.prompts.length) answer(g, 0) // resolve any defend/allocate prompt
    expect(atk.interactedTurn, 'striking marks interaction').toBe(g.turn)
    expect(drop(g, 0, atk.id, [art.id]), 'drop refused after attacking').toBeTruthy()
    expect(atk.carrying, 'artifact stays carried').toContain(art.id)
  })

  it('a carrier that only MOVED (unintercepted) may still drop', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    placeSite(g, 0, 'Spire', 2, 3)
    const u = summonCard(g, 0, 'Brown Bears', 2, 2)
    const art = giveArtifact(g, u, 'Ruby Core')
    act(g, 0, { t: 'moveAttack', unitId: u.id, path: [{ x: 2, y: 3, region: 'surface' }] })
    expect(u.interactedTurn, 'a plain move does not interact').not.toBe(g.turn)
    expect(drop(g, 0, u.id, [art.id]), 'drop allowed after only moving').toBeNull()
  })

  it('a caster that CAST a spell this turn cannot drop', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    summonCard(g, 1, 'Foot Soldiers', 3, 3) // a target on the board for the spell
    const avatar = g.units[g.players[0].avatarUnitId]
    const art = giveArtifact(g, avatar, 'Ruby Core')
    giveMana(g, 0, 20); waiveThreshold(g, 0)
    castMagic(g, 0, 'Snowball')
    while (g.prompts.length) answer(g, 0)
    expect(avatar.interactedTurn, 'casting marks interaction').toBe(g.turn)
    expect(drop(g, 0, avatar.id, [art.id]), 'drop refused after casting').toBeTruthy()
  })

  it('an interaction on a PRIOR turn does not block dropping this turn', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const u = summonCard(g, 0, 'Brown Bears', 2, 2)
    const art = giveArtifact(g, u, 'Ruby Core')
    u.interactedTurn = g.turn - 1 // interacted last turn only
    expect(drop(g, 0, u.id, [art.id]), 'stale interaction clears').toBeNull()
  })
})
