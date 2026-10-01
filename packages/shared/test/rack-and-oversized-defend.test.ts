// The Rack: "Whenever the bearer strikes an Avatar, stretch them onto another adjacent location, then
// they lose 1 life per location." It must fire on EFFECT strikes too (ctx.strike — Grapple Shot arrival,
// Hotwheel…), not only combat blows. Plus the oversized-defend fix: a fight happens at the square the
// attacker engaged, so defender eligibility is measured from THERE (not the target's anchor).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, giveArtifact, answer, act } from './helpers'
import { makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('The Rack fires on an effect strike', () => {
  it('ctx.strike by the bearer stretches the enemy Avatar and bleeds it per location', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const enemyAv = g.units[g.players[1].avatarUnitId]
    enemyAv.x = 1; enemyAv.y = 1
    for (const [x, y] of [[1, 1], [2, 1], [0, 1], [1, 0], [1, 2]] as const) placeSite(g, 1, 'Rustic Village', x, y)
    const bearer = summonCard(g, 0, 'Frog', 3, 3); bearer.enteredTurn = -1 // 0 power → isolate the Rack's bleed from strike damage
    giveArtifact(g, bearer, 'The Rack')
    const lifeBefore = enemyAv.life ?? 0

    makeCtx(g, bearer.id, 0, []).strike(bearer, { unit: enemyAv.id })
    if (g.prompts[0]?.kind === 'chooseSquare') answer(g, (g.prompts[0].data as any).squares[0]) // pick the stretch location

    expect(enemyAv.extraSquares?.length ?? 0, 'the Avatar was stretched').toBe(1)
    expect(enemyAv.life, 'and lost 1 life per location it now occupies (2)').toBe(lifeBefore - 2)
  })
})

describe('The Rack fires when striking an already-stretched Avatar on a non-anchor part', () => {
  it('attacking the Avatar on its extra square still racks it', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const enemyAv = g.units[g.players[1].avatarUnitId]
    enemyAv.x = 1; enemyAv.y = 1
    enemyAv.extraSquares = [{ x: 2, y: 1, region: 'surface' }] // already stretched onto (2,1)
    for (const [x, y] of [[1, 1], [2, 1], [3, 1], [2, 0], [2, 2]] as const) placeSite(g, 0, 'Rustic Village', x, y)
    const bearer = summonCard(g, 0, 'Escyllion Cyclops', 3, 1); bearer.enteredTurn = -1 // beside the (2,1) part
    giveArtifact(g, bearer, 'The Rack')
    const lifeBefore = enemyAv.life ?? 0

    // move onto the Avatar's NON-anchor part (2,1) and attack it there
    act(g, 0, { t: 'moveAttack', unitId: bearer.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: enemyAv.id } })
    let guard = 0
    while (g.prompts.length && guard++ < 30) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage' ? { strikerId: p.data.strikerId, allocation: { [enemyAv.id]: p.data.power } } : p.kind === 'chooseSquare' ? p.data.squares[0] : true)
    }
    expect((enemyAv.extraSquares?.length ?? 0) >= 2 || (enemyAv.life ?? 0) < lifeBefore, 'the Rack activated on the body-part hit').toBe(true)
  })
})

describe('defending an oversized unit: eligibility is measured from the engaged square', () => {
  it('a defender reachable from the attacked part (but not the anchor) may defend', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    for (const [x, y] of [[0, 1], [1, 1], [2, 1], [3, 1], [2, 0]] as const) placeSite(g, 0, 'Rustic Village', x, y)
    // oversized enemy spanning (0,1)-(2,1); anchor (0,1)
    const big = summonCard(g, 1, 'Bone Jumble', 0, 1); big.enteredTurn = -1
    big.extraSquares = [{ x: 1, y: 1, region: 'surface' }, { x: 2, y: 1, region: 'surface' }]
    // a would-be defender beside the FAR part (2,1) — 1 step from it, 3 from the anchor
    const defender = summonCard(g, 1, 'Bone Jumble', 3, 1); defender.enteredTurn = -1
    const attacker = summonCard(g, 0, 'Escyllion Cyclops', 2, 0); attacker.enteredTurn = -1

    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: big.id } })
    const defend = g.prompts.find((p) => p.kind === 'defend')
    expect(defend, 'a defend window opened').toBeTruthy()
    expect((defend!.data as any).candidates, 'the far-part defender is eligible (fight is at the engaged square)').toContain(defender.id)
  })
})
