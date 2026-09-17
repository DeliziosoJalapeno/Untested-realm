// Enchantress: "Whenever you cast a spell, you may animate an aura." That "when you cast" trigger must
// resolve BEFORE the spell resolves — so when you cast a Minion, the aura is animated before that
// minion enters and its Genesis fires. Probe: Death Dealer's Genesis kills every other minion, so a
// freshly-animated aura minion must be WIPED (it existed first), not survive.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fetchToHand, act, answer } from './helpers'
import { applyJudge, avatarOf, type GameState } from '../src'

describe('Enchantress cast-trigger timing', () => {
  it("animates the aura before the cast minion's Genesis (Death Dealer wipes the fresh aura minion)", () => {
    const g = newGame(); keepBoth(g)
    // a site to summon onto, plus mana + every threshold so Death Dealer is castable
    const villageId = fetchToHand(g, 0, 'Rustic Village')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: villageId, x: 2, y: 0 })
    if (g.prompts.length) answer(g, false)
    applyJudge(g, 0, { k: 'setMana', player: 0, value: 30 })
    for (const el of ['air', 'earth', 'fire', 'water'] as const) applyJudge(g, 0, { k: 'threshold', player: 0, element: el, delta: 5 })

    // Enchantress in play + an aura for her to animate
    applyJudge(g, 0, { k: 'summonUnit', name: 'Enchantress', player: 0, x: 2, y: 0, region: 'surface', noGenesis: true })
    const auraCard = `c${g.nextId++}`
    g.cards[auraCard] = { id: auraCard, name: 'Wildfire', owner: 0 }
    const auraId = `r${g.nextId++}`
    g.auras[auraId] = { id: auraId, cardId: auraCard, name: 'Wildfire', controller: 0, squares: [{ x: 2, y: 0 }] }

    applyJudge(g, 0, { k: 'addToHand', name: 'Death Dealer', player: 0 })
    const ddId = g.players[0].hand.find((id) => g.cards[id].name === 'Death Dealer')!

    act(g, 0, { t: 'castSpell', cardId: ddId, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })

    // the summon is PARKED behind the Enchantress's animate prompt — Death Dealer isn't in play yet
    expect(g.flow.pendingCast, 'summon deferred behind the animate prompt').toBeTruthy()
    expect(Object.values(g.units).some((u) => u.name === 'Death Dealer')).toBe(false)
    expect(g.prompts[0]?.kind).toBe('chooseTargets')

    // animate the aura → the boundary then summons Death Dealer, whose Genesis wipes the fresh minion
    answer(g, [auraId])

    expect(Object.values(g.units).some((u) => u.name === 'Death Dealer')).toBe(true)
    expect((g as GameState).flow.pendingCast).toBeFalsy()
    // proof of ordering: the animated aura minion existed when Genesis ran, so it was destroyed
    expect(g.auras[auraId], 'the aura was animated then wiped by the Genesis').toBeUndefined()
    expect(Object.values(g.units).some((u) => String(u.counters?.animatedAura ?? '') === auraId)).toBe(false)
  })

  it('a Magic cast also defers behind the animate, resolving only after it', () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0)
    applyJudge(g, 0, { k: 'summonUnit', name: 'Enchantress', player: 0, x: av.x, y: av.y, region: 'surface', noGenesis: true })
    const ench = Object.values(g.units).find((u) => u.name === 'Enchantress')!
    const auraCard = `c${g.nextId++}`; g.cards[auraCard] = { id: auraCard, name: 'Wildfire', owner: 0 }
    const auraId = `r${g.nextId++}`; g.auras[auraId] = { id: auraId, cardId: auraCard, name: 'Wildfire', controller: 0, squares: [{ x: av.x, y: av.y }] }
    applyJudge(g, 0, { k: 'setMana', player: 0, value: 30 })
    for (const el of ['air', 'earth', 'fire', 'water'] as const) applyJudge(g, 0, { k: 'threshold', player: 0, element: el, delta: 5 })
    applyJudge(g, 0, { k: 'addToHand', name: 'Immolation', player: 0 })
    const immoId = g.players[0].hand.find((id) => g.cards[id].name === 'Immolation')!

    // Immolation targets the co-located Enchantress (nearby the avatar caster)
    act(g, 0, { t: 'castSpell', cardId: immoId, casterId: g.players[0].avatarUnitId, targets: [ench.id] })

    expect(g.flow.pendingCast?.type).toBe('magic')
    expect(g.players[0].cemetery.includes(immoId), 'magic not resolved yet').toBe(false)

    answer(g, [auraId])

    expect((g as GameState).flow.pendingCast).toBeFalsy()
    expect(g.players[0].cemetery.includes(immoId), 'magic resolved (to cemetery) after the animate').toBe(true)
  })

  it('does NOT defer when no Enchantress is in play (scoping)', () => {
    const g = newGame(); keepBoth(g)
    const villageId = fetchToHand(g, 0, 'Rustic Village')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: villageId, x: 2, y: 0 })
    if (g.prompts.length) answer(g, false)
    applyJudge(g, 0, { k: 'setMana', player: 0, value: 30 })
    for (const el of ['air', 'earth', 'fire', 'water'] as const) applyJudge(g, 0, { k: 'threshold', player: 0, element: el, delta: 5 })
    applyJudge(g, 0, { k: 'addToHand', name: 'Death Dealer', player: 0 })
    const ddId = g.players[0].hand.find((id) => g.cards[id].name === 'Death Dealer')!

    act(g, 0, { t: 'castSpell', cardId: ddId, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })

    expect((g as GameState).flow.pendingCast).toBeFalsy() // resolved inline — nothing to defer behind
    expect(Object.values(g.units).some((u) => u.name === 'Death Dealer')).toBe(true)
  })
})
