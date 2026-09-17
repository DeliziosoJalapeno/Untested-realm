// Makeshift Barricade: "If one or more allies here would take damage, prevent it. If the damage was 3 or
// more, the barricade breaks." Two fixes:
//  • the Avatar is an ally, so it's shielded too (avatar damage reduces LIFE, so we assert on life);
//  • the 3+ break is counted ACROSS everything sheltered at once — FAQ: 1 damage to three allies here
//    simultaneously totals 3 and breaks it. The break settles at checkStateBased (the event boundary).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, act, answer } from './helpers'
import { avatarOf, checkStateBased, type GameState, type PlayerId } from '../src'
import { dealDamageToUnit } from '../src/engine/effects'
import '../src/cards/scripts/index'

function barricadeAt(g: GameState, owner: PlayerId, x: number, y: number): string {
  const cid = `cb${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Makeshift Barricade', owner }
  const aid = `ab${g.nextId++}`
  ;(g.artifacts as any)[aid] = { id: aid, cardId: cid, name: 'Makeshift Barricade', conjuredBy: owner, x, y, region: 'surface', carriedBy: null, tapped: false }
  return aid
}
const hit = (g: GameState, u: any, n: number) => dealDamageToUnit(g, u, n, 1, { source: { player: 1, kind: 'effect' } })

describe('Makeshift Barricade — shields the Avatar and breaks on 3+ across all it shelters', () => {
  it('prevents a small blow to the Avatar on its square; a <3 blow leaves it intact', () => {
    const g = newGame() as GameState; keepBoth(g)
    const av = avatarOf(g, 0); av.x = 2; av.y = 1; av.region = 'surface'
    const aid = barricadeAt(g, 0, 2, 1)
    const life = av.life
    hit(g, av, 2); checkStateBased(g)
    expect(av.life, 'the 2 damage was prevented — no life lost').toBe(life)
    expect((g.artifacts as any)[aid], 'a <3 blow leaves the barricade intact').toBeTruthy()
  })

  it('a single 3+ blow to the Avatar is prevented and breaks the barricade', () => {
    const g = newGame() as GameState; keepBoth(g)
    const av = avatarOf(g, 0); av.x = 2; av.y = 1; av.region = 'surface'
    const aid = barricadeAt(g, 0, 2, 1)
    const life = av.life
    hit(g, av, 4); checkStateBased(g)
    expect(av.life, 'the blow was still prevented — no life lost').toBe(life)
    expect((g.artifacts as any)[aid], 'the barricade splintered').toBeUndefined()
  })

  it('breaks when 1 damage hits three allies here at once (1+1+1 = 3) — FAQ', () => {
    const g = newGame() as GameState; keepBoth(g)
    const aid = barricadeAt(g, 0, 2, 1)
    const a = summonCard(g, 0, 'Bone Jumble', 2, 1)
    const b = summonCard(g, 0, 'Bone Jumble', 2, 1)
    const c = summonCard(g, 0, 'Bone Jumble', 2, 1)
    // three simultaneous 1-damage blows — all prevented (none call checkStateBased), so the tally accrues
    hit(g, a, 1); hit(g, b, 1); hit(g, c, 1)
    checkStateBased(g) // the event settles here
    expect(a.damage + b.damage + c.damage, 'all three blows were prevented').toBe(0)
    expect((g.artifacts as any)[aid], '1+1+1 = 3 → the barricade breaks').toBeUndefined()
  })

  it('does NOT sum across separate events: 1+1 then 1+1 never breaks it', () => {
    const g = newGame() as GameState; keepBoth(g)
    const aid = barricadeAt(g, 0, 2, 1)
    const a = summonCard(g, 0, 'Bone Jumble', 2, 1)
    const b = summonCard(g, 0, 'Bone Jumble', 2, 1)
    hit(g, a, 1); hit(g, b, 1); checkStateBased(g) // event 1: total 2 < 3 → holds, tally reset
    expect((g.artifacts as any)[aid], 'survives the first 2-damage event').toBeTruthy()
    hit(g, a, 1); hit(g, b, 1); checkStateBased(g) // event 2: another 2, must not sum with event 1
    expect((g.artifacts as any)[aid], 'still intact — events do not accumulate').toBeTruthy()
  })

  it('settles through real combat: a 3-power strike is absorbed and breaks the barricade', () => {
    const g = newGame() as GameState; keepBoth(g)
    const def = summonCard(g, 0, 'Bone Jumble', 2, 1); def.enteredTurn = -1 // my defender, on the barricade
    const aid = barricadeAt(g, 0, 2, 1)
    const atk = summonCard(g, 1, 'Stygian Archers', 2, 1); atk.enteredTurn = -1 // enemy 3-power striker, co-located
    g.phase = 'main'; g.activePlayer = 1
    act(g, 1, { t: 'moveAttack', unitId: atk.id, path: [], attack: { unit: def.id } })
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? (p.data?.candidates ?? []) : p.kind === 'allocateDamage'
        ? { strikerId: p.data.strikerId, allocation: { [def.id]: 3 } } : true)
    }
    expect(g.units[def.id]?.damage, 'the defender was shielded from the strike').toBe(0)
    expect((g.artifacts as any)[aid], 'absorbing the 3-power strike broke the barricade').toBeUndefined()
  })

  it('does not shield an enemy avatar (only allies)', () => {
    const g = newGame() as GameState; keepBoth(g)
    const foe = avatarOf(g, 1); foe.x = 2; foe.y = 1; foe.region = 'surface'
    barricadeAt(g, 0, 2, 1) // MY barricade
    const life = foe.life ?? 0
    dealDamageToUnit(g, foe, 2, 0, { source: { player: 0, kind: 'effect' } }); checkStateBased(g)
    expect(foe.life, 'the enemy avatar is not protected by my barricade').toBe(life - 2)
  })
})
