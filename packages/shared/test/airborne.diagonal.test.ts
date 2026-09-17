// Airborne diagonal steps are a SURFACE-only thing: an airborne unit may step diagonally only when it
// STARTS the step on the surface. Starting in the void or a subsurface region (underground/underwater) it
// moves orthogonally only. (A surface diagonal also needs a site to land on — a void square can't host a
// surface step — which is why boards without ground sites won't show diagonal moves.)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { isLegalStep } from '../src/engine/movement'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('airborne diagonals are only taken from the surface', () => {
  it('an airborne unit steps diagonally from the surface but not from the void/subsurface', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2) // where the unit stands on the surface
    placeSite(g, 0, 'Rustic Village', 1, 1) // a diagonal SURFACE site to land on
    // (2,0) is left a void (no site) for the into-void diagonal case
    const u = summonCard(g, 0, 'Bone Jumble', 2, 2); u.enteredTurn = -1
    for (const kw of ['airborne', 'voidwalk']) u.modifiers.push({ kind: 'keyword', keyword: kw, duration: 'permanent', turn: 0, sourcePlayer: 0 })

    // surface → surface diagonal (onto a site): legal
    expect(isLegalStep(g, u, { x: 2, y: 2, region: 'surface' }, { x: 1, y: 1, region: 'surface' }), 'diagonal from the surface').toBe(true)
    // surface → void diagonal (airborne voidwalker gliding off a site): legal — it starts on the surface
    expect(isLegalStep(g, u, { x: 2, y: 2, region: 'surface' }, { x: 3, y: 3, region: 'void' }), 'diagonal into void FROM the surface').toBe(true)

    // starting in the VOID: no diagonal
    expect(isLegalStep(g, u, { x: 2, y: 2, region: 'void' }, { x: 3, y: 3, region: 'void' }), 'no diagonal starting in the void').toBe(false)
    // starting UNDERGROUND: no diagonal (even into void)
    expect(isLegalStep(g, u, { x: 2, y: 2, region: 'underground' }, { x: 3, y: 3, region: 'void' }), 'no diagonal starting underground').toBe(false)
    // sanity: an ORTHOGONAL void glide is still fine (only diagonals are surface-gated)
    expect(isLegalStep(g, u, { x: 2, y: 2, region: 'void' }, { x: 2, y: 3, region: 'void' }), 'orthogonal void moves unaffected').toBe(true)
  })
})
