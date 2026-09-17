// The editor's "summon unit" op must fire the unit's Genesis, so a unit whose presence is set up
// in Genesis (Yog-Sothoth occupies EVERY square) is fully realized — not a bare head. Previously
// an editor-summoned Yog only existed at its summon square, so spells/projectiles/attacks aimed
// anywhere else did nothing.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { applyJudge, occupiedSquares, occupies, GRID_W, GRID_H, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('editor summon fires the unit Genesis', () => {
  it('an editor-summoned Yog-Sothoth occupies every square', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 4
    // sites on rows 0..2, leave row 3 (5 squares) as voids so Yog survives its 5-void check
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) if (y !== 3) placeSite(g, 0, 'Spire', x, y)

    expect(applyJudge(g, 0, { k: 'summonUnit', name: 'Yog-Sothoth', player: 1, x: 0, y: 0, region: 'surface' } as any)).toBeNull()
    const yog = Object.values(g.units).find((u) => u.name === 'Yog-Sothoth')!
    expect(yog, 'Yog survived (5 voids present)').toBeTruthy()
    expect(occupiedSquares(yog).length, 'occupies the whole realm').toBe(GRID_W * GRID_H)
    expect(occupies(yog, 3, 1, 'surface'), 'occupies a far non-head square').toBe(true)
  })

  it('noGenesis opts out — Yog lands as a bare head only', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 4
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) if (y !== 3) placeSite(g, 0, 'Spire', x, y)

    expect(applyJudge(g, 0, { k: 'summonUnit', name: 'Yog-Sothoth', player: 1, x: 0, y: 0, region: 'surface', noGenesis: true } as any)).toBeNull()
    const yog = Object.values(g.units).find((u) => u.name === 'Yog-Sothoth')!
    expect(yog, 'Yog exists').toBeTruthy()
    expect(occupiedSquares(yog).length, 'occupies only its head square').toBe(1)
    expect(occupies(yog, 3, 1, 'surface'), 'does NOT occupy a far square').toBe(false)
  })

  it('a plain minion editor-summon still just lands (no crash)', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 4
    placeSite(g, 0, 'Spire', 2, 2)
    expect(applyJudge(g, 0, { k: 'summonUnit', name: 'Bone Jumble', player: 0, x: 2, y: 2, region: 'surface' } as any)).toBeNull()
    expect(Object.values(g.units).some((u) => u.name === 'Bone Jumble')).toBe(true)
  })
})
