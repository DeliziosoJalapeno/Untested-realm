// Castle's/Hamlet's Ablaze! are SINGLE-SITE (1x1) auras — they cover exactly the one site they're
// conjured atop (not a 2x2 region) AND enforce their placement rule: Castle's needs an Elite/Unique
// site, Hamlet's an Ordinary/Exceptional one.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, injectToHand, giveMana, waiveThreshold, act, actFail } from './helpers'
import { avatarOf } from '../src'

describe('single-site (1x1) auras', () => {
  it("Castle's Ablaze! is 1x1 and only lands on an Elite/Unique site", () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 40); waiveThreshold(g, 0)
    placeSite(g, 0, 'Battlefield', 2, 2)    // Elite
    placeSite(g, 0, 'Rustic Village', 3, 2) // Ordinary
    const av = avatarOf(g, 0)
    // rejected on the Ordinary site
    const bad = injectToHand(g, 0, "Castle's Ablaze!")
    expect(actFail(g, 0, { t: 'castSpell', cardId: bad, casterId: av.id, at: { x: 3, y: 2 } })).toMatch(/Elite or Unique/)
    expect(Object.values(g.auras).length, 'no aura placed on the illegal site').toBe(0)
    // accepted on the Elite site, as a 1x1
    const good = injectToHand(g, 0, "Castle's Ablaze!")
    act(g, 0, { t: 'castSpell', cardId: good, casterId: av.id, at: { x: 2, y: 2 } })
    const auras = Object.values(g.auras) as any[]
    expect(auras.length).toBe(1)
    expect(auras[0].squares, '1x1, only the target site').toEqual([{ x: 2, y: 2 }])
    expect(auras[0].anchor, 'no 2x2 anchor').toBeUndefined()
  })

  it("Hamlet's Ablaze! only lands on an Ordinary/Exceptional site", () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 40); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 2) // Ordinary
    placeSite(g, 0, 'Battlefield', 3, 2)    // Elite
    const av = avatarOf(g, 0)
    const bad = injectToHand(g, 0, "Hamlet's Ablaze!")
    expect(actFail(g, 0, { t: 'castSpell', cardId: bad, casterId: av.id, at: { x: 3, y: 2 } })).toMatch(/Ordinary or Exceptional/)
    const good = injectToHand(g, 0, "Hamlet's Ablaze!")
    act(g, 0, { t: 'castSpell', cardId: good, casterId: av.id, at: { x: 2, y: 2 } })
    expect((Object.values(g.auras)[0] as any).squares).toEqual([{ x: 2, y: 2 }])
  })
})
