// Blink's destination square must be NEARBY THE CHOSEN ALLY (target 0), not the caster — and that bound is
// now enforced at target validation (spec.whereOf), so the UI offers only legal squares and the engine
// rejects an illegal one instead of accepting it and silently fizzling on resolution.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { applyJudge, validateTarget, type GameState, type UnitState } from '../src'
import { getScript } from '../src/cards/scripts/registry'

describe('Blink square target anchors to the ally, not the caster', () => {
  it('rejects a square far from the ally and accepts one nearby it', () => {
    const g = newGame(); keepBoth(g)
    const caster = g.units[g.players[0].avatarUnitId] as UnitState
    // put the ally in the opposite corner, far from the caster
    const ax = caster.x <= 2 ? 4 : 0
    const ay = caster.y <= 1 ? 3 : 0
    applyJudge(g as GameState, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x: ax, y: ay })
    applyJudge(g as GameState, 0, { k: 'summonUnit', name: 'Bone Jumble', player: 0, x: ax, y: ay, region: 'surface', noGenesis: true })
    const ally = Object.values(g.units).find((u) => u.name === 'Bone Jumble')! as UnitState
    const spec = getScript('Blink')!.targets![1]
    const picked = [{ unit: ally.id }]

    // a square ADJACENT to the ally → legal (measured from the ally)
    const near = { x: ax, y: ay <= 1 ? ay + 1 : ay - 1 }
    expect(validateTarget(g as GameState, spec, { square: near }, caster, 0, picked), 'nearby the ally is allowed').toBeNull()
    // the caster's own square → far from the ally → rejected
    expect(validateTarget(g as GameState, spec, { square: { x: caster.x, y: caster.y } }, caster, 0, picked), 'far from the ally is rejected').toBeTruthy()
    // without the whereOf anchor it would (wrongly) measure from the caster — proving the anchor moved to the ally
    expect(validateTarget(g as GameState, spec, { square: near }, caster, 0), 'same square is far from the CASTER').toBeTruthy()
  })
})
