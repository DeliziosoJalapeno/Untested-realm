// Kill credit (rulebook): priority 1 strike/ability-damage > 2 a Magic the unit cast > 3 an
// activated/triggered ability. The "dies" log names the killer(s). Accursed Albatross is the
// canonical consumer — its deathrite curses the KILLER's nearby allies.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, giveMana, waiveThreshold, answer, act } from './helpers'
import { avatarOf } from '../src'

const log = (g: any) => g.log.map((e: any) => e.msg).join('\n')
const drain = (g: any) => { let n = 0; while (g.prompts.length && n++ < 8) answer(g, g.prompts[0].kind === 'defend' ? [] : null) }

describe('kill credit', () => {
  it('P2 — a Magic kill credits the CASTER (Albatross curses the caster’s allies; log names the caster)', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    placeSite(g, 0, 'Rustic Village', 3, 2); placeSite(g, 0, 'Rustic Village', 2, 1)
    const alba = summonCard(g, 1, 'Accursed Albatross', 3, 2, 'surface'); alba.enteredTurn = 0
    const ally = summonCard(g, 0, 'Stygian Archers', 2, 1, 'surface'); ally.enteredTurn = 0 // nearby the CASTER (avatar)

    castMagic(g, 0, 'Lightning Bolt', { targets: ['sq:3,2'] })
    drain(g)

    expect(g.units[alba.id], 'the bolt killed the Albatross').toBeUndefined()
    expect(g.units[ally.id], "the caster's nearby ally is cursed (deathrite credited the caster)").toBeUndefined()
    expect(log(g), 'the death log names the killer').toMatch(new RegExp(`Accursed Albatross dies\\. \\(killed by ${av.name}\\)`))
  })

  it('P1 — a combat kill names the striker in the log', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const attacker = summonCard(g, 0, 'Stygian Archers', 2, 2, 'surface'); attacker.enteredTurn = 0
    const target = summonCard(g, 1, 'Stygian Archers', 2, 2, 'surface'); target.enteredTurn = 0
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: target.id } })
    drain(g)
    expect(log(g)).toMatch(/Stygian Archers dies\. \(killed by Stygian Archers\)/)
  })
})
