// Deathspeaker echoing Archangel Michael (reported: "Deathspeaker archangel Michael didn't work").
// Michael's Genesis ("take a step, then strike all enemies here") raises a prompt — the echo must be
// allowed to FULLY resolve that Genesis before Deathspeaker banishes it, not cut short.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, act, answer, giveMana } from './helpers'
import { avatarOf, type GameState } from '../src'

describe('Deathspeaker echo of Archangel Michael resolves its full Genesis', () => {
  it('the echo steps, smites the enemy, and only THEN fades (no early banish)', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    avatarOf(g, 0).name = 'Deathspeaker'
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 2)
    const foe = summonCard(g, 1, 'Foot Soldier', 3, 2); foe.enteredTurn = -1 // the smite target
    giveMana(g, 0, 20)

    // Archangel Michael lies in your cemetery
    const mcard = `cm${g.nextId++}`
    g.cards[mcard] = { id: mcard, name: 'Archangel Michael', owner: 0 } as any
    g.players[0].cemetery.push(mcard)

    act(g, 0, { t: 'activate', sourceId: avatarOf(g, 0).id, ability: 'speak' })
    answer(g, 'Archangel Michael')              // speak for Michael
    if (g.prompts[0]?.kind === 'chooseSquare') answer(g, { x: 2, y: 2 }) // echo appears at (2,2)

    // Genesis: Michael steps to a nearby site. Step to (3,2) where the foe stands.
    const site32 = Object.values(g.sites).find((s) => s.x === 3 && s.y === 2)!.id
    expect(g.prompts[0]?.kind, 'the Genesis step prompt fired (not cut short)').toBe('chooseTargets')
    answer(g, [site32])
    // drain any trailing strike-order prompts
    let guard = 0
    while (g.prompts.length && guard++ < 10) answer(g, g.prompts[0].kind === 'defend' ? [] : true)

    expect(foe && g.units[foe.id], 'Michael stepped onto the foe and smote it').toBeUndefined()
    expect(Object.values(g.units).some((u) => u.name === 'Archangel Michael'), 'the echo faded after its Genesis').toBe(false)
  })
})
