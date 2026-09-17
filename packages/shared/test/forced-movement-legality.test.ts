// Forced-movement audit: teleports that should respect movement rules. A "take a step"/"move to
// adjacent" respects Immobile/walls/entry-bans; a "push/pull/drag" can't drag a unit out of a Cage of
// Sidrak or shove it into the void; a directional "move N steps" stops at a gap.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

const immobilize = (g: GameState, u: any) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'immobile', duration: 'permanent', turn: g.turn, sourcePlayer: u.controller })

describe('a "take a step" effect cannot move an Immobile unit', () => {
  it('Innsmouth Dock does not lure an Immobile adjacent minion', () => {
    const g = newGame() as GameState; keepBoth(g)
    const dock = placeSite(g, 0, 'Innsmouth Dock', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 1); foe.enteredTurn = -1; immobilize(g, foe)

    getScript('Innsmouth Dock')!.abilities![0].effect(makeCtx(g, dock.id, 0, [{ unit: foe.id }]))
    expect(foe.x === 2 && foe.y === 1, 'the Immobile minion stays put').toBe(true)
  })

  it('Second Wind offers no step (and moves nothing) for an Immobile ally', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const ally = summonCard(g, 0, 'Bone Jumble', 2, 2); ally.enteredTurn = -1; immobilize(g, ally)

    getScript('Second Wind')!.onCast!(makeCtx(g, ally.id, 0, [{ unit: ally.id }]))
    expect(g.prompts.length, 'no step prompt — it cannot move').toBe(0)
    expect(ally.x === 2 && ally.y === 2, 'the Immobile ally is unmoved').toBe(true)
  })
})

describe('a forced drag cannot pull a unit out of a Cage of Sidrak', () => {
  it('Gargantula fails to drag a caged minion', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const garg = summonCard(g, 0, 'Gargantula', 2, 2); garg.enteredTurn = -1
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 1); foe.enteredTurn = -1
    g.flow = g.flow ?? {}
    ;(g.flow as any).cagedUnits = [{ unitId: foe.id }]
    foe.counters = { ...foe.counters, caged: 1 }

    getScript('Gargantula')!.genesis!(makeCtx(g, garg.id, 0, [{ unit: foe.id }]))
    expect(foe.x === 2 && foe.y === 1, 'the caged minion is not dragged out').toBe(true)
  })
})

describe('an Immobile Frontier Settlers plays its site but cannot move onto it', () => {
  it('the site is established adjacent, but the Immobile Settlers stays put (and still loses the ability)', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const settlers = summonCard(g, 0, 'Frontier Settlers', 2, 2); settlers.enteredTurn = -1; immobilize(g, settlers)
    // fence in 3 of the 4 orthogonal neighbours so the only settle spot is the empty (2,1)
    placeSite(g, 0, 'Rustic Village', 2, 3)
    placeSite(g, 0, 'Rustic Village', 1, 2)
    placeSite(g, 0, 'Rustic Village', 3, 2)
    const siteCard = `atlas${g.nextId++}`; g.cards[siteCard] = { id: siteCard, name: 'Rustic Village', owner: 0 }
    g.players[0].atlas.unshift(siteCard)

    getScript('Frontier Settlers')!.abilities![0].effect(makeCtx(g, settlers.id, 0, []))
    expect(g.sites && Object.values(g.sites).some((s) => s.x === 2 && s.y === 1 && !s.isRubble), 'the frontier site is played').toBe(true)
    expect(settlers.x === 2 && settlers.y === 2, 'the Immobile Settlers did not move onto it').toBe(true)
    expect(settlers.counters?.settled, 'the ability is spent').toBe(1)
  })
})

describe('a directional "move N steps" stops at a gap', () => {
  it('Bull Demons of Adum halts where the sites run out', () => {
    const g = newGame() as GameState; keepBoth(g)
    const bull = summonCard(g, 0, 'Bull Demons of Adum', 1, 2); bull.enteredTurn = -1
    placeSite(g, 0, 'Rustic Village', 1, 2)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    // no site at (3,2) — the rampage east can only take one step
    getScript('Bull Demons of Adum')!.conts!.go(makeCtx(g, bull.id, 0, []), {}, 'e')
    expect(bull.x, 'stops at the last sited square (2,2), not off into the gap').toBe(2)
    expect(bull.y).toBe(2)
  })
})
