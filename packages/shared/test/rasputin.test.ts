// Grigori Rasputin FAQ tests.
//
// FAQ 1: Evil determination uses isEvilUnit() — this honors Evil Twin (counters.evilTwin)
//   and Saint of Redemption suppression, not just raw subtype checks.
//
// FAQ 2: the banished ally must be in the realm (not in hand or cemetery).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer } from './helpers'
import { getScript, makeCtx } from '../src'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

/** Put Rasputin's card in player 0's cemetery and return the card id. */
function rasputinInCemetery(g: GameState): string {
  const cardId = `cras${g.nextId++}`
  ;(g.cards as any)[cardId] = { id: cardId, name: 'Grigori Rasputin', owner: 0 }
  g.players[0].cemetery.push(cardId)
  return cardId
}

describe('Grigori Rasputin — FAQ 1: isEvilUnit determines Evil allies', () => {
  it('a Demon/Undead/Monster minion is treated as Evil', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const skeleton = summonCard(g, 0, 'Skeleton', 2, 2) // Undead subtype
    const cardId = rasputinInCemetery(g)

    const ability = getScript('Grigori Rasputin')!.cemeteryAbilities!(g, cardId, 0)![0]
    ability.effect(makeCtx(g, cardId, 0, []))

    // Should prompt to choose the Evil ally (the Skeleton)
    const pr = g.prompts[0]
    expect(pr?.kind, 'chooseTargets prompt appears for an Undead ally').toBe('chooseTargets')
    expect((pr!.data as any).candidates, 'Skeleton is offered as an Evil candidate').toContain(skeleton.id)
  })

  it('Evil Twin (counters.evilTwin) is treated as Evil even with no Evil subtype', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    // A Foot Soldier with the evilTwin counter — not Demon/Undead/Monster by subtype
    const twin = summonCard(g, 0, 'Foot Soldier', 2, 2)
    twin.counters = { ...(twin.counters ?? {}), evilTwin: 1 }
    const cardId = rasputinInCemetery(g)

    const ability = getScript('Grigori Rasputin')!.cemeteryAbilities!(g, cardId, 0)![0]
    ability.effect(makeCtx(g, cardId, 0, []))

    const pr = g.prompts[0]
    expect(pr?.kind, 'chooseTargets prompt appears').toBe('chooseTargets')
    expect((pr!.data as any).candidates, 'Evil Twin foot soldier is offered as Evil').toContain(twin.id)
  })

  it('Saint of Redemption suppresses all Evil — no ally is offered', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    summonCard(g, 0, 'Skeleton', 2, 2) // would normally be Evil
    summonCard(g, 0, 'Saint of Redemption', 3, 2) // suppresses all Evil
    const cardId = rasputinInCemetery(g)

    const ability = getScript('Grigori Rasputin')!.cemeteryAbilities!(g, cardId, 0)![0]

    let logged = false
    const ctx = makeCtx(g, cardId, 0, [])
    // patch log to detect the "no Evil ally" message
    const origLog = ctx.log.bind(ctx)
    ctx.log = (msg: string) => { logged = true; return origLog(msg) }

    ability.effect(ctx)

    expect(g.prompts.length, 'no target prompt when Saint suppresses Evil').toBe(0)
    expect(logged, 'a log message about no Evil ally is emitted').toBe(true)
  })
})

describe('Grigori Rasputin — FAQ 2: banished ally must be in the realm', () => {
  it('only in-realm allies appear as candidates (not units in hand or cemetery)', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const inRealm = summonCard(g, 0, 'Skeleton', 2, 2) // in realm

    // A Skeleton card in hand (not a unit — just a card)
    const handCard = `ch${g.nextId++}`
    ;(g.cards as any)[handCard] = { id: handCard, name: 'Skeleton', owner: 0 }
    g.players[0].hand.push(handCard)

    const cardId = rasputinInCemetery(g)
    const ability = getScript('Grigori Rasputin')!.cemeteryAbilities!(g, cardId, 0)![0]
    ability.effect(makeCtx(g, cardId, 0, []))

    const pr = g.prompts[0]
    expect(pr?.kind).toBe('chooseTargets')
    const cands: string[] = (pr!.data as any).candidates
    expect(cands, 'the in-realm Skeleton is offered').toContain(inRealm.id)
    // the hand card is not a unit so it cannot appear as a unit candidate
    expect(cands.length, 'exactly one candidate: the in-realm Skeleton').toBe(1)
  })
})
