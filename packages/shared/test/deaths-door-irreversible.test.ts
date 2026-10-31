// Death's Door isn't reversible in general: only text that explicitly removes it (Divine Intervention)
// lifts it. And an Avatar whose life reaches 0 by any route — paying life included — is at Death's Door.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, waiveThreshold, answer, giveMana } from './helpers'
import { avatarOf, makeCtx, getScript, type GameState } from '../src'
import '../src/cards/scripts/index'

describe("Death's Door can't be undone", () => {
  it("Kairos the Archivist: life totals don't revert (FAQ), so an Avatar at Death's Door stays there", () => {
    const g = newGame() as GameState; keepBoth(g)
    const kairos = summonCard(g, 0, 'Kairos the Archivist', 1, 1); kairos.enteredTurn = -1
    getScript('Kairos the Archivist')!.genesis!(makeCtx(g, kairos.id, 0, []))
    const av = avatarOf(g, 1)
    av.life = 0; av.deathsDoor = true; av.doorTurn = g.turn
    getScript('Kairos the Archivist')!.deathrite!(makeCtx(g, kairos.id, 0, []))
    expect(avatarOf(g, 1).life).toBe(0)
    expect(avatarOf(g, 1).deathsDoor).toBe(true)
  })

  it("Kairos doesn't restore a life total that has dropped either", () => {
    const g = newGame() as GameState; keepBoth(g)
    const kairos = summonCard(g, 0, 'Kairos the Archivist', 1, 1); kairos.enteredTurn = -1
    getScript('Kairos the Archivist')!.genesis!(makeCtx(g, kairos.id, 0, []))
    avatarOf(g, 1).life = 7
    getScript('Kairos the Archivist')!.deathrite!(makeCtx(g, kairos.id, 0, []))
    expect(avatarOf(g, 1).life).toBe(7)
  })
})

describe('Demonic Contract: paying 4 life', () => {
  const setup = (life: number) => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Spire', 2, 2)
    summonCard(g, 0, 'Abaddon Succubus', 2, 2).enteredTurn = -1
    avatarOf(g, 0).life = life
    giveMana(g, 0, 10)
    castMagic(g, 0, 'Demonic Contract', {})
    return g
  }

  it('paying down to exactly 0 puts the Avatar at Death\'s Door', () => {
    const g = setup(4)
    expect((g.prompts[0]?.data as any)?.options).toContain('pay 4 life')
    answer(g, 'pay 4 life')
    expect(avatarOf(g, 0).life).toBe(0)
    expect(avatarOf(g, 0).deathsDoor).toBe(true)
  })

  it("can't pay more life than you have (FAQ)", () => {
    const g = setup(3)
    expect(g.prompts.some((p) => ((p.data as any)?.options ?? []).includes('pay 4 life'))).toBe(false)
  })
})
