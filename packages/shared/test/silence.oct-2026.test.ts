// Silence as the October 2026 rules have it. Silence removes only PRINTED abilities and stops
// spellcasting; Stealth, Ward and Lance are entry triggers, so a minion entering silenced gets none,
// and a minion already marked keeps its Stealth or Ward mark when it is silenced later.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, castMagic, fillSites, waiveThreshold, injectToHand, giveMana } from './helpers'
import { applyAction, checkStateBased } from '../src'

describe('Silence (Oct 2026 rules)', () => {
  it('a minion already marked with Ward or Stealth keeps the mark when silenced, and the Ward still works', () => {
    const g: any = newGame(); keepBoth(g); fillSites(g)
    const warrior = summonCard(g, 0, 'Holy Warrior', 2, 1); warrior.ward = true
    const thieves = summonCard(g, 0, 'Band of Thieves', 2, 1); thieves.stealth = true
    summonCard(g, 1, 'Sisters of Silence', 3, 1)
    checkStateBased(g)
    expect(g.units[warrior.id].silenced).toBe(true)
    expect(g.units[warrior.id].ward).toBe(true)
    expect(g.units[thieves.id].stealth).toBe(true)
  })

  it('a minion cast into a Silence gets no Ward mark and no Lance', () => {
    const g: any = newGame(); keepBoth(g); fillSites(g); waiveThreshold(g, 0)
    summonCard(g, 1, 'Sisters of Silence', 3, 1)
    castMagic(g, 0, 'Holy Warrior', { at: { x: 2, y: 1 } })
    castMagic(g, 0, 'Purple Knight', { at: { x: 2, y: 1 } })
    const warrior = Object.values(g.units).find((u: any) => u.name === 'Holy Warrior') as any
    const knight = Object.values(g.units).find((u: any) => u.name === 'Purple Knight') as any
    expect(warrior.ward).toBeFalsy()
    expect(knight.carrying.length).toBe(0)
    // away from the Sisters, the same minions enter marked and armed
    castMagic(g, 0, 'Holy Warrior', { at: { x: 0, y: 3 } })
    castMagic(g, 0, 'Purple Knight', { at: { x: 0, y: 3 } })
    const far = Object.values(g.units).filter((u: any) => u.x === 0 && u.y === 3) as any[]
    expect(far.find((u) => u.name === 'Holy Warrior')?.ward).toBe(true)
    expect(far.find((u) => u.name === 'Purple Knight')?.carrying.length).toBe(1)
  })

  it('a silenced minion can\'t cast spells, even a Spellcaster', () => {
    const g: any = newGame(); keepBoth(g); fillSites(g); waiveThreshold(g, 0); giveMana(g, 0, 20)
    const wizard = summonCard(g, 0, 'Apprentice Wizard', 2, 1)
    wizard.silenced = true
    const cardId = injectToHand(g, 0, 'Overpower')
    const res = applyAction(g, 0, { t: 'castSpell', cardId, casterId: wizard.id, targets: [wizard.id] } as any)
    expect(res.ok).toBe(false)
  })
})
