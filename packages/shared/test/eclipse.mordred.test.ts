import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer } from './helpers'
import { getScript, killUnit, isLegalStep } from '../src'

// Eclipse should behave like Crusade / Jihad: the "you may summon Evil minions to affected sites"
// permission is bound to the aura's OWN squares (a covered site — even an enemy's — but nowhere
// else), and it does NOT restrict ordinary movement.
const AURA = (controller: 0 | 1) => ({
  id: 'e1', name: 'Eclipse', controller,
  squares: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
})

describe('Eclipse: consistent with Crusade / Jihad', () => {
  it('permits summoning an Evil minion onto a covered square, not one outside the aura', () => {
    const g: any = newGame(); keepBoth(g)
    const allows = getScript('Eclipse')!.auraAllowsSummon!
    const aura = AURA(0)
    expect(allows(g, aura, 0, 'Escyllion Cyclops', { x: 0, y: 0 }), 'Monster (Evil), inside the aura').toBe(true)
    expect(allows(g, aura, 0, 'Bone Jumble', { x: 1, y: 1 }), 'Undead (Evil), inside the aura').toBe(true)
    expect(allows(g, aura, 0, 'Escyllion Cyclops', { x: 4, y: 3 }), 'Evil minion OUTSIDE the aura → no').toBe(false)
    expect(allows(g, aura, 0, 'Cave Trolls', { x: 0, y: 0 }), 'a non-Evil minion is never permitted').toBe(false)
    expect(allows(g, AURA(1), 0, 'Escyllion Cyclops', { x: 0, y: 0 }), 'only the controller gets the permission').toBe(false)
  })

  it('does NOT block moving an Evil minion onto an affected site', () => {
    const g: any = newGame(); keepBoth(g)
    g.auras['e1'] = { id: 'e1', name: 'Eclipse', controller: 0, squares: AURA(0).squares }
    placeSite(g, 0, 'Active Volcano', 0, 0)
    placeSite(g, 1, 'Active Volcano', 1, 0) // an ENEMY site, but under the Eclipse
    const evil = summonCard(g, 0, 'Escyllion Cyclops', 0, 0); evil.enteredTurn = -1
    const from = { x: 0, y: 0, region: 'surface' as const }
    const to = { x: 1, y: 0, region: 'surface' as const }
    expect(isLegalStep(g, evil, from, to), 'ordinary movement into the affected area is unaffected').toBe(true)
  })
})

describe('Sir Mordred: "adjacent" includes his own square', () => {
  it('deathrite kills a co-located enemy minion (same site)', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 1)
    const mordred = summonCard(g, 0, 'Sir Mordred', 2, 1); mordred.enteredTurn = -1
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 1); foe.enteredTurn = 0 // SAME square as Mordred

    killUnit(g, mordred.id)
    expect(g.prompts[0]?.kind, 'the deathrite fires and offers the co-located enemy').toBe('chooseTargets')
    answer(g, [foe.id])
    expect(g.units[foe.id], 'the co-located enemy is slain by Mordred’s dying treachery').toBeUndefined()
  })
})
