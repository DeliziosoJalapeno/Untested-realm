// Redmane Hyena is a ONE-SHOT Genesis (printed + FAQ): "Genesis → Banish up to three cards from
// cemeteries. If any are Demons, this becomes one and gains +2 power permanently." It does not
// continuously watch the cemetery. This locks in the timing the report worried about: a Demon that
// dies MID-TURN is in the cemetery immediately (kills route synchronously), so the Hyena's Genesis,
// run afterwards, sees it and transforms — nothing waits until end of turn.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, answer } from './helpers'
import { getScript, makeCtx, killUnit, effAttack, effSubtypes, applyJudge, applyAction, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Redmane Hyena Genesis sees a demon that died mid-turn', () => {
  it('a Demon killed this turn is in the cemetery at once and the Hyena eats it', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3

    // a Demon dies mid-turn → routed to its owner's cemetery synchronously (not end of turn)
    const demon = summonCard(g, 0, 'Dead of Night Demon', 1, 1); demon.enteredTurn = -5
    const demonCardId = demon.cardId
    killUnit(g, demon.id)
    expect(g.players[0].cemetery.includes(demonCardId), 'the demon is in the cemetery immediately').toBe(true)

    // now the Hyena enters and its Genesis fires — it must SEE the fresh demon
    const hyena = summonCard(g, 0, 'Redmane Hyena', 2, 2)
    getScript('Redmane Hyena')!.genesis!(makeCtx(g, hyena.id, 0, []))
    const prompt = g.prompts[0]
    expect(prompt?.kind, 'the gnaw prompt opens').toBe('chooseCards')
    const idx = (prompt!.data.cards as string[]).indexOf('Dead of Night Demon')
    expect(idx, 'the fresh demon is offered in the pool').toBeGreaterThanOrEqual(0)
    answer(g, [idx])

    // it ate a Demon → becomes a Demon (still a Beast) and gains +2 power permanently
    expect(effAttack(g, g.units[hyena.id]), 'power 2 + 2').toBe(4)
    const subs = effSubtypes(g, g.units[hyena.id])
    expect(subs.includes('Demon'), 'now a Demon').toBe(true)
    expect(subs.includes('Beast'), 'still a Beast (FAQ)').toBe(true)
    expect(g.players[0].banished.includes(demonCardId), 'the eaten demon is banished').toBe(true)
  })

  it('eating a Pudge Butcher (a Demon) grants the power too', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const cid = `c${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Pudge Butcher', owner: 0 } as any
    g.players[0].cemetery.push(cid)

    const hyena = summonCard(g, 0, 'Redmane Hyena', 2, 2)
    getScript('Redmane Hyena')!.genesis!(makeCtx(g, hyena.id, 0, []))
    const prompt = g.prompts[0]
    const idx = (prompt!.data.cards as string[]).indexOf('Pudge Butcher')
    expect(idx, 'Pudge Butcher offered').toBeGreaterThanOrEqual(0)
    answer(g, [idx])

    expect(effAttack(g, g.units[hyena.id]), 'Pudge Butcher is a Demon → +2 power').toBe(4)
    expect(effSubtypes(g, g.units[hyena.id]).includes('Demon'), 'became a Demon').toBe(true)
  })

  it('EDITOR-summoned Hyena eating a Pudge Butcher, resolved GUI-style, still gains power', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    // a Spire so the summon square is legal terrain
    const site = `s${g.nextId++}`; g.sites[site] = { id: site, cardId: `sc${g.nextId++}`, name: 'Spire', owner: 0, controller: 0, x: 2, y: 2, tapped: false, isRubble: false } as any
    const cid = `c${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Pudge Butcher', owner: 0 } as any
    g.players[0].cemetery.push(cid)

    // Editor "→ board": summon fires Genesis (the fix from earlier) → opens the gnaw prompt
    expect(applyJudge(g, 0, { k: 'summonUnit', name: 'Redmane Hyena', player: 0, x: 2, y: 2, region: 'surface' })).toBeNull()
    const hyena = Object.values(g.units).find((u) => u.name === 'Redmane Hyena')!
    const prompt = g.prompts[0]
    expect(prompt?.kind, 'the gnaw prompt opens for an editor-summoned Hyena').toBe('chooseCards')
    const idx = (prompt!.data.cards as string[]).indexOf('Pudge Butcher')
    // resolve exactly like the GUI does: send the chosen indices
    expect(applyAction(g, prompt!.player, { t: 'prompt', promptId: prompt!.id, choice: [idx] } as any).ok).toBe(true)

    expect(effAttack(g, g.units[hyena.id]), '+2 power via the editor + GUI path').toBe(4)
    expect(effSubtypes(g, g.units[hyena.id]).includes('Demon'), 'became a Demon').toBe(true)
    expect(g.players[0].banished.includes(cid), 'Pudge Butcher banished').toBe(true)
  })
})
