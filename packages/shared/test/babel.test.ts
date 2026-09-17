// Tower of Babel: The Apex of Babel played atop The Base of Babel builds the Tower (site keeps the
// name "The Apex of Babel" but is marked counters.tower). Two fixes:
//   • Spire Lich ("if atop a Tower, +2 power, Ranged, Spellcaster") must recognise a built Tower of Babel.
//   • "you may cast a spell for free" casts the chosen hand spell IMMEDIATELY (not a hanging free credit).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, injectToHand } from './helpers'
import { effKeywords, effAttack, effectCastHandCard, avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Spire Lich atop a Tower', () => {
  it('activates on a built Tower of Babel (site marked counters.tower)', () => {
    const g = newGame() as GameState; keepBoth(g)
    const site = placeSite(g, 0, 'The Apex of Babel', 2, 2)
    site.counters = { ...site.counters, tower: 1 } // the merged Apex+Base = the Tower of Babel
    const lich = summonCard(g, 0, 'Spire Lich', 2, 2); lich.enteredTurn = -1

    const kw = effKeywords(g, lich)
    expect(kw.ranged, 'Ranged atop the Tower').toBeTruthy()
    expect(kw.spellcaster, 'Spellcaster atop the Tower').toBeTruthy()
    const towerPow = effAttack(g, lich)

    // control: the same Lich on an ordinary site gets nothing
    const g2 = newGame() as GameState; keepBoth(g2)
    placeSite(g2, 0, 'Rustic Village', 2, 2)
    const plain = summonCard(g2, 0, 'Spire Lich', 2, 2); plain.enteredTurn = -1
    expect(effKeywords(g2, plain).ranged ?? false, 'no Ranged off a Tower').toBe(false)
    expect(towerPow - effAttack(g2, plain), 'the Tower grants +2 power').toBe(2)
  })

  it('still works for a site literally named a Tower', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Lone Tower', 2, 2)
    const lich = summonCard(g, 0, 'Spire Lich', 2, 2); lich.enteredTurn = -1
    expect(effKeywords(g, lich).spellcaster).toBe(true)
  })
})

describe('effectCastHandCard — the Tower\'s free casting resolves immediately', () => {
  it('casts a chosen hand spell for free, right away, without spending mana', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 1)
    const victim = summonCard(g, 1, 'Brother Knight', 3, 1); victim.enteredTurn = -1 // a Mortal
    const spell = injectToHand(g, 0, 'All Mortals Gone') // "Kill all Mortals" — no target prompt
    const manaBefore = g.players[0].mana

    effectCastHandCard(g, 0, spell, { free: true })

    expect(g.units[victim.id], 'the Mortal was killed — the spell resolved immediately').toBeUndefined()
    expect(g.players[0].hand.includes(spell), 'the real hand card was consumed (not duplicated)').toBe(false)
    expect(g.players[0].mana, 'it was free — no mana spent').toBe(manaBefore)
    // avatar is still around (not a Mortal)
    expect(avatarOf(g, 0), 'the caster avatar survives').toBeTruthy()
  })

  it('labels the placement prompt with the real card name, NOT "Copy of …"', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const minion = injectToHand(g, 0, 'Bone Jumble')
    effectCastHandCard(g, 0, minion, { free: true })
    const p = g.prompts[0]
    expect(p?.kind, 'a placement prompt was raised').toBe('chooseSquare')
    expect(p.title.includes('Copy of'), 'a real hand card is not a copy').toBe(false)
    expect(p.title.includes('Bone Jumble'), 'the prompt names the actual card').toBe(true)
  })

  it('a free spell that cannot resolve (no valid target) stays in hand, credit forfeited', () => {
    const g = newGame() as GameState; keepBoth(g)
    const spell = injectToHand(g, 0, 'Degradation') // "Transform a Mortal…" — no Mortals on the board
    const manaBefore = g.players[0].mana
    effectCastHandCard(g, 0, spell, { free: true })
    expect(g.players[0].hand.includes(spell), 'the real card is NOT deleted on a fizzle').toBe(true)
    expect((g.flow?.freeCast ?? []).includes(spell), 'the one-shot free credit is dropped').toBe(false)
    expect(g.players[0].mana, 'no mana spent').toBe(manaBefore)
  })
})
