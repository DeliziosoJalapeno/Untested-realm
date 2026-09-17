// Sirian Templar: "Takes no damage from Demon, Spirit, or Undead minions." He must survive
// a fight with an Undead (its strike deals 0 to him). A non-Evil striker damages him normally.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { dealDamageToUnit, checkStateBased, beginAttack } from '../src'

describe('Sirian Templar takes no damage from Demon/Spirit/Undead minions', () => {
  it('an Undead strike deals 0 damage to him (direct)', () => {
    const g: any = newGame(); keepBoth(g)
    const dk = summonCard(g, 1, 'Death Knight', 3, 1) // Undead 3/3
    const sirian = summonCard(g, 0, 'Sirian Templar', 2, 1) // 3/3
    dealDamageToUnit(g, sirian, 3, 1, { source: { player: 1, kind: 'strike', attackerId: dk.id, name: dk.name } })
    checkStateBased(g)
    expect(g.units[sirian.id], 'Sirian is unharmed by the Undead').toBeTruthy()
    expect(g.units[sirian.id].damage).toBe(0)
  })

  it('a non-Evil (Mortal) strike damages him normally (control)', () => {
    const g: any = newGame(); keepBoth(g)
    const mob = summonCard(g, 1, 'Common Cottagers', 3, 1) // Mortal 2/2
    const sirian = summonCard(g, 0, 'Sirian Templar', 2, 1)
    dealDamageToUnit(g, sirian, 2, 1, { source: { player: 1, kind: 'strike', attackerId: mob.id, name: mob.name } })
    checkStateBased(g)
    expect(g.units[sirian.id].damage).toBe(2)
  })

  it('survives an actual fight with an Undead (it strikes back for 0)', () => {
    const g: any = newGame(); keepBoth(g)
    const dk = summonCard(g, 1, 'Death Knight', 2, 1) // Undead 3/3 defender
    const sirian = summonCard(g, 0, 'Sirian Templar', 2, 1) // co-located attacker, 3/3
    sirian.tapped = false; sirian.enteredTurn = -1 // ready to fight
    beginAttack(g, sirian, { unit: dk.id })
    // resolve any allocation prompts automatically (single target → none expected)
    expect(g.units[sirian.id], 'Sirian survives the Undead strike-back').toBeTruthy()
    expect(g.units[sirian.id].damage, 'the Undead dealt him 0').toBe(0)
    expect(g.units[dk.id], 'the Death Knight took Sirian\'s 3 and fell').toBeFalsy()
  })
})
