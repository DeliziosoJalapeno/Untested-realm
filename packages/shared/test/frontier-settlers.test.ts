// Frontier Settlers: "Tap → play your topmost site to an adjacent void/Rubble; move there and lose this
// ability." Two fixed bugs: (1) the played site's Genesis must FULLY run (it was raw-inserted → no Genesis);
// (2) the ability must be gone after one use (was still clickable, wasting the tap).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, actFail, answer } from './helpers'
import type { GameState } from '../src'

function atlasTop(g: GameState, player: 0 | 1, name: string) {
  const cid = `ctest${(g as any).nextId++}`
  ;(g as any).cards[cid] = { id: cid, name, owner: player }
  g.players[player].atlas.unshift(cid)
}

describe('Frontier Settlers', () => {
  it("fully runs the played site's Genesis (Tadpole Pool → 3 Frogs), not a raw insert", () => {
    const g = newGame(); keepBoth(g)
    g.flow = { ...(g.flow ?? {}), judgeThresh: { 0: { water: 3 } } } as any // satisfy Tadpole Pool's (W)(W)(W) gate
    placeSite(g, 0, 'Hamlet', 2, 2)
    const fs = summonCard(g, 0, 'Frontier Settlers', 2, 2); fs.enteredTurn = -1; fs.tapped = false
    atlasTop(g, 0, 'Tadpole Pool')

    act(g, 0, { t: 'activate', sourceId: fs.id, ability: 'settle' })
    if (g.prompts.length) answer(g, { x: 2, y: 1 }) // choose the adjacent void to settle

    const pool = Object.values(g.sites).find((s) => s.name === 'Tadpole Pool')
    expect(pool, 'the topmost site was played').toBeTruthy()
    const frogs = Object.values(g.units).filter((u) => u.name === 'Frog' && u.x === pool!.x && u.y === pool!.y)
    expect(frogs.length, "the site's Genesis fully ran — three Frogs summoned").toBe(3)
    expect(g.units[fs.id].x === pool!.x && g.units[fs.id].y === pool!.y, 'the Settlers moved onto it').toBe(true)
  })

  it('loses the ability after its first use (not clickable again)', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Hamlet', 2, 2)
    const fs = summonCard(g, 0, 'Frontier Settlers', 2, 2); fs.enteredTurn = -1; fs.tapped = false
    atlasTop(g, 0, 'Pond')

    act(g, 0, { t: 'activate', sourceId: fs.id, ability: 'settle' })
    if (g.prompts.length) answer(g, { x: 2, y: 1 })
    expect(g.units[fs.id].counters?.settled, 'marked settled').toBe(1)

    g.units[fs.id].tapped = false // untap to isolate the "lost the ability" gate from the tap cost
    const err = actFail(g, 0, { t: 'activate', sourceId: fs.id, ability: 'settle' })
    expect(err, 'ability is gone after settling — activation rejected').toBeTruthy()
  })
})
