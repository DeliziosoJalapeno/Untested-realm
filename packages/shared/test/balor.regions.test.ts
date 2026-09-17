import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'

// FAQ (Balor of the Evil Eye): "one unit at each location in every square in the cardinal
// direction — surface AND subsurface of sites, AS WELL AS the void." A location is one region in
// one square, so the gaze hits surface + subsurface, and it does NOT stop at the void.
describe('Balor of the Evil Eye hits every location along the ray', () => {
  it('hits both a surface AND a subsurface unit, and crosses a void gap to reach them', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 0, 1) // land site under Balor
    // (1,1) is left as VOID (no site) — the gaze must cross it, not stop
    placeSite(g, 0, 'Rustic Village', 2, 1) // a land site two squares east: surface + underground
    const balor = summonCard(g, 0, 'Balor of the Evil Eye', 0, 1)
    balor.enteredTurn = -1
    const surfaceFoe = summonCard(g, 1, 'Escyllion Cyclops', 2, 1) // 6/6 on the surface
    surfaceFoe.enteredTurn = -1
    const buriedFoe = summonCard(g, 1, 'Cave Trolls', 2, 1) // 3/3 Burrowing, underground
    buriedFoe.region = 'underground'; buriedFoe.enteredTurn = -1

    act(g, 0, { t: 'activate', sourceId: balor.id, ability: 'gaze' })
    answer(g, 'e') // gaze east
    let guard = 0
    while (g.prompts.length && guard++ < 8) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'chooseTargets' ? [p.data.candidates[0]] : null)
    }

    expect(g.units[surfaceFoe.id]?.damage, 'the surface unit was gazed for 2').toBe(2)
    expect(g.units[buriedFoe.id]?.damage, 'the SUBSURFACE unit was gazed for 2 too (across the void gap)').toBe(2)
  })
})
