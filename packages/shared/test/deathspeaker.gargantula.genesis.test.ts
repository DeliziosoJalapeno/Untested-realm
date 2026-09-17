// Deathspeaker flickers a copy of a dead minion, which "uses its Genesis, then is banished."
// A Genesis that NEEDS a target (Gargantula — "drag an adjacent minion here, cocooning it")
// was silently no-op'ing on effect-summon because effectSummonUnit fired genesis with no
// targets. The flicker now collects the genesis target (anchored at the landing square) and
// passes it through, so the drag+cocoon actually happens.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer } from './helpers'
import { getScript, makeCtx, avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Deathspeaker echoes Gargantula and its drag-Genesis fires', () => {
  it("drags and cocoons an adjacent enemy minion when the echo lands", () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const av = avatarOf(g, 0); av.name = 'Deathspeaker'; av.x = 0; av.y = 0
    g.players[0].mana = 20
    // a controlled site gives a legal landing square at (2,2)
    placeSite(g, 0, 'Spire', 2, 2)
    // Gargantula lies dead in your cemetery
    const cid = `c${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Gargantula', owner: 0 } as any
    g.players[0].cemetery.push(cid)
    // an enemy minion sits adjacent to the landing square
    const prey = summonCard(g, 1, 'Bone Jumble', 2, 3)

    // activate: banish a dead minion → flicker a copy
    getScript('Deathspeaker')!.abilities![0].effect(makeCtx(g, av.id, 0, []))
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    answer(g, 'Gargantula')
    // land the echo on the controlled site at (2,2)
    if (g.prompts[0]?.kind === 'chooseSquare') answer(g, { x: 2, y: 2 })
    // NEW: the drag-Genesis now asks who to wrap in silk
    expect(g.prompts[0]?.kind, 'the echo asks for its drag target').toBe('chooseTargets')
    expect(g.prompts[0]?.data.candidates, 'the adjacent enemy is offered').toContain(prey.id)
    answer(g, [prey.id])

    // the prey was dragged onto the landing square and cocooned…
    expect(prey.x, 'dragged to the echo location (x)').toBe(2)
    expect(prey.y, 'dragged to the echo location (y)').toBe(2)
    expect(prey.disabled, 'wrapped in silk → disabled').toBe(true)
    expect(prey.counters?.cocooned, 'has a cocoon counter').toBe(1)

    // …and the echo itself faded back into death (banished), while Gargantula's card
    // left the cemetery for the banished pile.
    expect(Object.values(g.units).some((u) => u.name === 'Gargantula'), 'the echo is gone').toBe(false)
    expect(g.players[0].cemetery, 'Gargantula left the cemetery').not.toContain(cid)
    expect(g.players[0].banished, 'to the banished pile').toContain(cid)
  })

  it('a dead minion with NO drag target still flickers (no genesis prompt)', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const av = avatarOf(g, 0); av.name = 'Deathspeaker'; av.x = 0; av.y = 0
    g.players[0].mana = 20
    placeSite(g, 0, 'Spire', 2, 2)
    const cid = `c${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Gargantula', owner: 0 } as any
    g.players[0].cemetery.push(cid)
    // NO minion anywhere near (2,2) to drag

    getScript('Deathspeaker')!.abilities![0].effect(makeCtx(g, av.id, 0, []))
    answer(g, 'Gargantula')
    if (g.prompts[0]?.kind === 'chooseSquare') answer(g, { x: 2, y: 2 })
    // no candidates → no genesis prompt; the flicker completed cleanly
    expect(g.prompts.length, 'no lingering prompt').toBe(0)
    expect(g.players[0].banished, 'Gargantula was banished after the echo').toContain(cid)
  })
})
