// Forced movement, three kinds:
//  · a PULL (push:true) ignores MOBILITY limits (Immobile) but honours entry-bans — so Maelström-style
//    pulls drag even an Immobile minion.
//  · cards whose text deliberately drags/pushes INTO the void (Lacuna Entity, Nightmare, Into the Abyss)
//    may reach a siteless (void) square — a non-Voidwalk victim is then lost to the abyss, a Voidwalk one
//    survives there.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, answer, waiveThreshold } from './helpers'
import { getScript, makeCtx, type GameState, type UnitState } from '../src'
import '../src/cards/scripts/index'

const immobilize = (u: UnitState, turn: number, by: 0 | 1) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'immobile', duration: 'permanent', turn, sourcePlayer: by })
const grantVoidwalk = (u: UnitState, turn: number, by: 0 | 1) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'voidwalk', duration: 'permanent', turn, sourcePlayer: by })

describe('a PULL ignores Immobile', () => {
  it('teleport(push) drags an Immobile minion one step', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 1, 1)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const foe = summonCard(g, 1, 'Bone Jumble', 1, 1); foe.enteredTurn = -1
    immobilize(foe, g.turn, 1)
    const ctx = makeCtx(g, g.players[0].avatarUnitId, 0, [])
    ctx.teleport(foe.id, 2, 1, 'surface', { push: true }) // a forced pull
    expect(g.units[foe.id]?.x, 'the Immobile minion was still pulled').toBe(2)
  })
})

describe('Lacuna Entity drags a minion into the void', () => {
  it('a non-Voidwalk victim is banished; a Voidwalk one survives in the void', () => {
    for (const voidwalk of [false, true]) {
      const g = newGame() as GameState; keepBoth(g)
      placeSite(g, 0, 'Rustic Village', 1, 2) // the victim's site, adjacent to the Entity's void square
      const lac = summonCard(g, 0, 'Lacuna Entity', 2, 2); lac.region = 'void'; lac.enteredTurn = -1 // dwells in the void (Voidwalk)
      const foe = summonCard(g, 1, 'Bone Jumble', 1, 2); foe.enteredTurn = -1
      if (voidwalk) grantVoidwalk(foe, g.turn, 1)
      getScript('Lacuna Entity')!.genesis!(makeCtx(g, lac.id, 0, [{ unit: foe.id }]))
      if (voidwalk) {
        expect(g.units[foe.id]?.region, 'Voidwalk victim survives in the void').toBe('void')
        expect(g.units[foe.id]?.x).toBe(2)
      } else {
        expect(g.units[foe.id], 'non-Voidwalk victim is lost to the abyss').toBeUndefined()
      }
    }
  })
})

describe('Into the Abyss pulls a minion into an adjacent void', () => {
  it('the non-Voidwalk target is dragged into the void and banished', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 1, 1) // target's site; (2,1) is left as void (no site)
    const foe = summonCard(g, 1, 'Bone Jumble', 1, 1); foe.enteredTurn = -1
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Into the Abyss', { targets: [foe.id] })
    // choose the void pull (submerge isn't offered — (1,1) isn't water)
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    answer(g, 'pull into the void')
    expect(g.units[foe.id], 'the target was pulled into the void and lost').toBeUndefined()
  })
})
