// Archimago: "Banish three magic spells in your cemetery → Cast a copy of one of them." The player
// CHOOSES the magic to echo AND the two burned alongside it (was an arbitrary "first three"), then
// the copy is CAST for real (never a token left in hand).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, answer, giveMana, waiveThreshold, summonCard } from './helpers'
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

  it('the echoed copy VANISHES — it never lands in the cemetery (no re-echo loop)', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0)
    avatar.name = 'Archimago'; avatar.life = 10
    for (let i = 0; i < 3; i++) toCemetery(g, 0, 'Divine Healing')
    giveMana(g, 0, 5); waiveThreshold(g, 0)

    act(g, 0, { t: 'activate', sourceId: avatar.id, ability: 'echo' })
    answer(g, [0])
    answer(g, [0, 1])

    expect(avatar.life, 'the copy resolved').toBe(17)
    // the three cost cards are banished; the COPY left no card behind — cemetery is empty, so you
    // can't re-echo the copy for an infinite loop.
    expect(g.players[0].cemetery.length, 'the copy did NOT return to the cemetery').toBe(0)
    expect(g.players[0].banished.length, 'exactly the three cost cards are banished (not a 4th copy)').toBe(3)
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

// FAQ: "When using this ability, must the Archimago be the caster? No, any of your spellcasters can
// cast the copied spell." So whenever you control MORE THAN ONE legal spellcaster, Archimago must ask
// which one casts the copy — for EVERY spell, not just position-based ones (who casts can trigger
// "whenever you cast" effects, Sturmgeist, Enchantress, caster-element locks, …).
describe('Archimago — choose which spellcaster casts the copy', () => {
  function echoSetup(g: GameState, echo: string, extraSpellcaster: boolean) {
    const avatar = avatarOf(g, 0); avatar.name = 'Archimago'
    if (extraSpellcaster) summonCard(g, 0, 'Apprentice Wizard', 3, 2) // a 2nd (plain) Spellcaster
    for (let i = 0; i < 3; i++) toCemetery(g, 0, echo)
    giveMana(g, 0, 20); waiveThreshold(g, 0)
    act(g, 0, { t: 'activate', sourceId: avatar.id, ability: 'echo' })
    answer(g, [0])    // echo the first
    answer(g, [0, 1]) // banish the other two
    return avatar
  }

  it('asks for the caster even for a NON-positional spell (All Mortals Gone) when you have two spellcasters', () => {
    const g = newGame(); keepBoth(g)
    const wiz = summonCard(g, 0, 'Apprentice Wizard', 3, 2)
    const avatar = avatarOf(g, 0); avatar.name = 'Archimago'
    for (let i = 0; i < 3; i++) toCemetery(g, 0, 'All Mortals Gone')
    giveMana(g, 0, 20); waiveThreshold(g, 0)
    act(g, 0, { t: 'activate', sourceId: avatar.id, ability: 'echo' })
    answer(g, [0]); answer(g, [0, 1])
    const p = g.prompts[0]
    expect(p?.kind, 'a caster-choice prompt is offered').toBe('chooseTargets')
    expect(String(p?.title)).toMatch(/which spellcaster/i)
    expect((p?.data as any).candidates, 'both your spellcasters are offered')
      .toEqual(expect.arrayContaining([avatar.id, wiz.id]))
  })

  it('does NOT ask when the avatar is your only spellcaster (nothing to choose)', () => {
    const g = newGame(); keepBoth(g)
    echoSetup(g, 'All Mortals Gone', false)
    // no caster prompt — it auto-casts from the avatar and resolves straight away
    expect(g.prompts.some((pr) => /which spellcaster/i.test(String(pr.title))), 'no needless caster prompt').toBe(false)
  })

  it('honours the chosen caster — the copy is cast THROUGH the picked spellcaster, not the avatar', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0); avatar.name = 'Archimago'
    const wiz = summonCard(g, 0, 'Apprentice Wizard', 3, 2)
    for (let i = 0; i < 3; i++) toCemetery(g, 0, 'Firebolts')
    giveMana(g, 0, 20); waiveThreshold(g, 0)

    act(g, 0, { t: 'activate', sourceId: avatar.id, ability: 'echo' })
    answer(g, [0]); answer(g, [0, 1])
    expect(String(g.prompts[0]?.title)).toMatch(/which spellcaster/i)
    const before = g.log.length
    answer(g, [wiz.id])     // cast the copy THROUGH the wizard
    answer(g, 'e')          // resolve its direction (the copy actually casts here)
    // the cast-start log names the CHOSEN caster — proving the copy is cast by the wizard, not the avatar
    expect(g.log.slice(before).some((l) => /casts Firebolts with Apprentice Wizard/i.test(l.msg)),
      'the copy was cast by the chosen spellcaster').toBe(true)
    expect(g.prompts.length).toBe(0)
  })
})
