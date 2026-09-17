// Hotwheel's "roll forward" used to mutate its y directly, silently skipping every onUnitEntersSquare
// trigger — so Briar Patch (and Druid, Dark Alley, …) never fired as it traversed a site. It now emits
// the movement event per step, so enter/leave triggers run.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { applyJudge, makeCtx, getScript, type GameState } from '../src'

describe('Hotwheel traversal fires site triggers (Briar Patch)', () => {
  it('takes Briar Patch damage rolling THROUGH it (enter + leave = lethal to a 2/2)', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 1, { k: 'placeSite', name: 'Accursed Tower', player: 1, x: 2, y: 2 }) // roll start
    applyJudge(g, 0, { k: 'placeSite', name: 'Briar Patch', player: 0, x: 2, y: 1 })    // enemy thorns
    applyJudge(g, 1, { k: 'placeSite', name: 'Accursed Tower', player: 1, x: 2, y: 0 }) // roll end
    applyJudge(g, 1, { k: 'summonUnit', name: 'Hotwheel', player: 1, x: 2, y: 2, region: 'surface', noGenesis: true })
    const hw = Object.values(g.units).find((u) => u.name === 'Hotwheel')!

    getScript('Hotwheel')!.genesis!(makeCtx(g as GameState, hw.id, 1, []))

    // (2,2)→(2,1) thorns +1 on ENTER, (2,1)→(2,0) thorns +1 on LEAVE = 2 = its whole defence → dead
    expect(g.units[hw.id]).toBeUndefined()
  })

  it('takes only the ENTER hit when it comes to rest on the Briar Patch', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 1, { k: 'placeSite', name: 'Accursed Tower', player: 1, x: 2, y: 2 })
    applyJudge(g, 0, { k: 'placeSite', name: 'Briar Patch', player: 0, x: 2, y: 1 })
    // no site beyond (2,1) → the roll stops there
    applyJudge(g, 1, { k: 'summonUnit', name: 'Hotwheel', player: 1, x: 2, y: 2, region: 'surface', noGenesis: true })
    const hw = Object.values(g.units).find((u) => u.name === 'Hotwheel')!

    getScript('Hotwheel')!.genesis!(makeCtx(g as GameState, hw.id, 1, []))

    expect(g.units[hw.id]?.damage).toBe(1) // one thorn hit on entry, survives (2 defence)
    expect(g.units[hw.id]?.y).toBe(1)      // rested on the Briar Patch
  })
})
