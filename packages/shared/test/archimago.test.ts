// Archimago: "Banish three magic spells in your cemetery → Cast a copy of one of them." The player
// CHOOSES the magic to echo AND the two burned alongside it (was an arbitrary "first three"), then
// the copy is CAST for real (never a token left in hand).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, answer, giveMana, waiveThreshold } from './helpers'
import { avatarOf, type GameState, type PlayerId } from '../src'

function toCemetery(g: GameState, player: PlayerId, name: string): string {
  const id = `cm${g.nextId++}`
  ;(g.cards as any)[id] = { id, name, owner: player }
  g.players[player].cemetery.push(id)
  return id
}

describe('Archimago echo', () => {
  it('casts a real copy (targetless resolves) and burns three dead magics', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0)
    avatar.name = 'Archimago'
    avatar.life = 10
    for (let i = 0; i < 3; i++) toCemetery(g, 0, 'Divine Healing')
    // the copy is a NORMAL cast now — it must pay Divine Healing's (1) mana + Earth thresholds
    giveMana(g, 0, 5); waiveThreshold(g, 0)

    act(g, 0, { t: 'activate', sourceId: avatar.id, ability: 'echo' })
    expect(g.prompts[0]?.kind, 'the selection prompt lists specific dead magics').toBe('chooseCards')
    answer(g, [0])    // echo the first Divine Healing
    answer(g, [0, 1]) // banish the other two (forced with exactly three)

    expect(avatar.life, 'the copy was CAST for real (avatar healed)').toBe(17)
    expect(g.players[0].banished.length, 'three magics banished as the cost').toBe(3)
    expect(g.players[0].hand.filter((id) => (g.cards[id] as any).isToken).length, 'no free token left in hand').toBe(0)
    expect(g.prompts.length).toBe(0)
  })

  it('the echoed copy PAYS mana (not free) — deducts Divine Healing\'s (1)', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0)
    avatar.name = 'Archimago'; avatar.life = 10
    for (let i = 0; i < 3; i++) toCemetery(g, 0, 'Divine Healing')
    giveMana(g, 0, 5); waiveThreshold(g, 0)
    const manaBefore = g.players[0].mana

    act(g, 0, { t: 'activate', sourceId: avatar.id, ability: 'echo' })
    answer(g, [0])
    answer(g, [0, 1])

    expect(avatar.life, 'copy resolved (avatar healed)').toBe(17)
    expect(g.players[0].mana, 'the copy paid Divine Healing\'s (1) mana').toBe(manaBefore - 1)
  })

  it('the echoed copy is BLOCKED when you cannot afford / meet thresholds (no free cast)', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0)
    avatar.name = 'Archimago'; avatar.life = 10
    for (let i = 0; i < 3; i++) toCemetery(g, 0, 'Divine Healing')
    // no mana + no threshold waiver → the copy cannot be cast; the avatar does NOT heal
    g.players[0].mana = 0

    act(g, 0, { t: 'activate', sourceId: avatar.id, ability: 'echo' })
    answer(g, [0])
    answer(g, [0, 1])

    expect(avatar.life, 'the copy could not be cast (no free heal)').toBe(10)
    expect(g.players[0].banished.length, 'the three magics were still spent as the cost').toBe(3)
    expect(g.players[0].hand.filter((id) => (g.cards[id] as any).isToken).length, 'no lingering token in hand').toBe(0)
    expect(g.prompts.length, 'no dangling prompt').toBe(0)
  })

  it('lets you choose WHICH two are banished alongside the echoed one', () => {
    const g: any = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0)
    avatar.name = 'Archimago'
    const p = g.players[0]
    const A = toCemetery(g, 0, 'Rain of Arrows')  // echoed (no target → resolves)
    const B = toCemetery(g, 0, 'Lightning Bolt')
    const C = toCemetery(g, 0, 'Raise Dead')
    const D = toCemetery(g, 0, 'Plague of Frogs') // NOT chosen → must survive

    act(g, 0, { t: 'activate', sourceId: avatar.id, ability: 'echo' })
    answer(g, [0])    // echo A (index 0 of [A,B,C,D])
    answer(g, [0, 1]) // banish B,C (indices 0,1 of the remaining [B,C,D]) — NOT D

    expect(p.cemetery, 'the un-chosen magic stays in the cemetery').toContain(D)
    for (const id of [A, B, C]) expect(p.cemetery, 'chosen magics left the cemetery').not.toContain(id)
    expect(p.banished, 'exactly the three chosen were banished').toEqual(expect.arrayContaining([A, B, C]))
    expect(p.banished, 'the un-chosen magic was NOT banished').not.toContain(D)
  })

  it('can be cancelled at the first prompt — nothing is banished', () => {
    const g: any = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0); avatar.name = 'Archimago'
    const p = g.players[0]
    for (let i = 0; i < 3; i++) toCemetery(g, 0, 'Divine Healing')
    const cemBefore = [...p.cemetery]
    act(g, 0, { t: 'activate', sourceId: avatar.id, ability: 'echo' })
    answer(g, []) // "✕ Cancel" (Take none) at the echo prompt
    expect(p.cemetery, 'cemetery untouched').toEqual(cemBefore)
    expect(p.banished.length, 'nothing banished').toBe(0)
    expect(g.prompts.length, 'no dangling prompt').toBe(0)
  })
})
