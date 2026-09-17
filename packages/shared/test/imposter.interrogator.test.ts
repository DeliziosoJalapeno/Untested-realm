// An Imposter masked as Interrogator must perform Interrogator's triggered ability —
// "whenever an ally strikes an enemy Avatar, they draw a spell unless the victim pays 3 life".
// This fires from ANY strike, including an EFFECT strike (Quarrelsome Kobolds' end-of-turn
// brawl), because every strike path emits onAllyStrikesAvatar and the mask forwards it.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, answer } from './helpers'
import { getScript, makeCtx, avatarOf, emitEvent, type GameState } from '../src'
import '../src/cards/scripts/index'

function maskAsInterrogator(g: GameState) {
  avatarOf(g, 0).name = 'Imposter'
  g.flow = g.flow ?? {}
  ;(g.flow as any).imposterMask = { 0: 'Interrogator' }
}

describe('Imposter masked as Interrogator performs the interrogation', () => {
  it('a normal ally strike on the enemy Avatar triggers the interrogation prompt', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 5
    maskAsInterrogator(g)
    const foeAv = avatarOf(g, 1)
    const ally = summonCard(g, 0, 'Bone Jumble', 1, 1); ally.enteredTurn = 0
    emitEvent(g, 'onAllyStrikesAvatar', ally, foeAv)
    expect(g.prompts[0]?.kind, 'the mask asks pay-3-or-draw').toBe('chooseOption')
    expect(g.prompts[0]?.data.options).toEqual(['pay 3 life', 'let them draw'])
  })

  it("Quarrelsome Kobolds' end-of-turn strike on the enemy Avatar triggers it too", () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 5
    maskAsInterrogator(g)
    const foeAv = avatarOf(g, 1); foeAv.x = 2; foeAv.y = 2
    const kob = summonCard(g, 0, 'Quarrelsome Kobolds', 2, 3); kob.enteredTurn = 0 // adjacent

    getScript('Quarrelsome Kobolds')!.endOfTurn!(makeCtx(g, kob.id, 0, []))
    answer(g, [foeAv.id]) // the Kobolds strike the enemy avatar
    // → the masked Interrogator now interrogates
    expect(g.prompts[0]?.kind, 'interrogation fires off the effect strike').toBe('chooseOption')
    const lifeBeforePay = avatarOf(g, 1).life! // (already reflects the Kobolds' strike damage)
    answer(g, 'pay 3 life')
    expect(avatarOf(g, 1).life, 'victim paid the 3-life toll on top of the strike').toBe(lifeBeforePay - 3)
  })
})
