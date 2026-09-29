// Lacuna Entity — "Drag target weaker minion from an adjacent site to here, ignoring regions."
// "ignoring regions" is about ELIGIBILITY: the Entity may grab a weaker minion in ANY region of an
// adjacent site (surface / underground / underwater / void), not only its own. It then drags the
// victim to HERE — the Entity's location INCLUDING its region — so a SUBMERGED Entity pulls the
// victim underwater and a non-Submerge victim DROWNS. That removal is the card's primary use.
// (The void-dwelling Entity banishing a non-Voidwalk victim lives in forced-movement-void.test.ts.)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { getScript, validateTarget, makeCtx, type GameState, type UnitState, type Region } from '../src'
import '../src/cards/scripts/index'

const grant = (u: UnitState, kw: string, g: GameState) =>
  u.modifiers.push({ kind: 'keyword', keyword: kw as any, duration: 'permanent', turn: g.turn, sourcePlayer: 1 })

describe('submerged Lacuna Entity grabs across regions', () => {
  it('validateTarget accepts a weaker minion in every region at an adjacent site', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 1, 2)
    const lac = summonCard(g, 0, 'Lacuna Entity', 2, 2, 'underwater'); lac.enteredTurn = -1
    const spec = getScript('Lacuna Entity')!.genesisTargets![0]
    for (const region of ['surface', 'underground', 'underwater', 'void'] as Region[]) {
      const foe = summonCard(g, 1, 'Bone Jumble', 1, 2, region); foe.enteredTurn = -1
      expect(validateTarget(g, spec, { unit: foe.id }, lac as UnitState, 0), `region ${region}`).toBeNull()
      delete g.units[foe.id]
    }
  })

  it('a SUBMERGED Entity drags the victim underwater — non-Submerge drowns, Submerge survives', () => {
    for (const submerge of [false, true]) {
      const g = newGame() as GameState; keepBoth(g)
      const home = placeSite(g, 0, 'Rustic Village', 2, 2); home.flooded = true // water: the Entity's own underwater layer
      placeSite(g, 0, 'Rustic Village', 1, 2)
      const lac = summonCard(g, 0, 'Lacuna Entity', 2, 2, 'underwater'); lac.enteredTurn = -1
      const foe = summonCard(g, 1, 'Bone Jumble', 1, 2, 'surface'); foe.enteredTurn = -1
      if (submerge) grant(foe, 'submerge', g)
      getScript('Lacuna Entity')!.genesis!(makeCtx(g, lac.id, 0, [{ unit: foe.id }]))
      if (submerge) {
        expect(g.units[foe.id]?.region, 'a Submerge victim survives underwater').toBe('underwater')
        expect(g.units[foe.id]?.x).toBe(2)
        expect(g.units[foe.id]?.y).toBe(2)
      } else {
        expect(g.units[foe.id], 'a land minion dragged underwater drowns').toBeUndefined()
      }
    }
  })
})
