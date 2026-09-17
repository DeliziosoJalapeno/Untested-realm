// Dream-Quest FAQ tests.
//
// FAQ 1: casting Dream-Quest on your own Avatar has no effect — avatars cannot be disabled.
//   The 'what: minion' spec already excludes avatars; validateTarget must reject them.
//
// FAQ 2: an allied Spellcaster minion (not a non-spellcaster) can be put to sleep.
//   A filter on the spec gates to spellcasters only.
//
// ENGINE GAP (not testable from m51.ts alone, engine edits required):
//   Spellcaster ARTIFACTS (e.g. Char Omphalos) and spellcaster SITES (e.g. River of Flame)
//   cannot yet be targeted. Supporting them requires:
//     1. A new mixed target type (or separate artifact/site specs) in casting.ts.
//     2. Engine-side disabled state: site.counters.asleep suppressing threshold in affinity(),
//        artifact.counters.asleep suppressing casting in resolveCaster().
//   Until that engine work lands, only minion spellcasters are covered.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, waiveThreshold, answer } from './helpers'
import { validateTarget } from '../src/engine/casting'
import { getScript, makeCtx } from '../src'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('Dream-Quest FAQ 1 — avatar cannot be targeted', () => {
  it('the target spec rejects the allied avatar (avatars are not minions)', () => {
    const g: GameState = newGame(); keepBoth(g)
    const myAv = g.units[g.players[0].avatarUnitId]
    const spec = getScript('Dream-Quest')!.targets![0]
    const reason = validateTarget(g, spec, { unit: myAv.id }, myAv, 0)
    expect(reason, 'avatar must be rejected by the minion spec').not.toBeNull()
  })
})

describe('Dream-Quest FAQ 2 — Spellcaster minion can be put to sleep', () => {
  it('accepts a Spellcaster minion as a valid target', () => {
    const g: GameState = newGame(); keepBoth(g)
    const caster = g.units[g.players[0].avatarUnitId]
    const wizard = summonCard(g, 0, 'Skeleton Mage', 2, 2) // has Spellcaster keyword
    const spec = getScript('Dream-Quest')!.targets![0]
    expect(validateTarget(g, spec, { unit: wizard.id }, caster, 0), 'Spellcaster minion is a valid target').toBeNull()
  })

  it('rejects a non-Spellcaster minion', () => {
    const g: GameState = newGame(); keepBoth(g)
    const caster = g.units[g.players[0].avatarUnitId]
    const soldier = summonCard(g, 0, 'Foot Soldier', 2, 2) // no Spellcaster keyword
    const spec = getScript('Dream-Quest')!.targets![0]
    const reason = validateTarget(g, spec, { unit: soldier.id }, caster, 0)
    expect(reason, 'non-Spellcaster minion must be rejected').not.toBeNull()
  })

  it('onCast disables the Spellcaster and marks it asleep', () => {
    const g: GameState = newGame(); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const wizard = summonCard(g, 0, 'Skeleton Mage', 2, 2)

    castMagic(g, 0, 'Dream-Quest', { targets: [wizard.id] })

    expect(wizard.disabled, 'wizard is disabled immediately').toBe(true)
    expect(wizard.counters?.asleep, 'wizard has the asleep counter').toBe(1)
  })

  it('startOfTurn prompts to wake the dreamer; yes grants a spellbook card', () => {
    const g: GameState = newGame(); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const wizard = summonCard(g, 0, 'Skeleton Mage', 2, 2)

    castMagic(g, 0, 'Dream-Quest', { targets: [wizard.id] })

    // Simulate Dream-Quest being in the cemetery (castMagic moves it there already)
    // and advance past the turn it was cast so the startOfTurn condition fires.
    g.turn += 2
    g.activePlayer = 0

    const dqCardId = g.players[0].cemetery[g.players[0].cemetery.length - 1]
    getScript('Dream-Quest')!.startOfTurn!(makeCtx(g, dqCardId, 0, []))

    // Should prompt: wake the dreamer?
    expect(g.prompts[0]?.kind, 'wake-up yesNo prompt appears').toBe('yesNo')

    const spellbookCard0 = g.players[0].spellbook[0]
    answer(g, true) // yes, wake
    expect(g.prompts[0]?.kind, 'spellbook search prompt appears').toBe('chooseCards')
    answer(g, [0]) // pick index 0

    expect(wizard.disabled, 'wizard is no longer disabled after waking').toBeUndefined()
    expect(wizard.counters?.asleep, 'asleep counter removed after waking').toBeFalsy()
    expect(g.players[0].hand, 'a card from the spellbook is now in hand').toContain(spellbookCard0)
  })

  it('if the dreamer was hurt (asleep counter removed) before wake-up, no prize is offered', () => {
    const g: GameState = newGame(); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const wizard = summonCard(g, 0, 'Skeleton Mage', 2, 2)

    castMagic(g, 0, 'Dream-Quest', { targets: [wizard.id] })

    // Simulate the wizard being hurt — remove the asleep counter
    if (wizard.counters) delete wizard.counters.asleep
    wizard.disabled = undefined

    g.turn += 2
    g.activePlayer = 0

    const dqCardId = g.players[0].cemetery[g.players[0].cemetery.length - 1]
    getScript('Dream-Quest')!.startOfTurn!(makeCtx(g, dqCardId, 0, []))

    // startOfTurn clears the quest entry but sees no asleep counter — no prompt
    expect(g.prompts.length, 'no wake-up prompt when dreamer was already woken by damage').toBe(0)
  })
})
