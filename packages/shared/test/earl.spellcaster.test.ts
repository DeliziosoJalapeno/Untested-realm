// Earl of the Ivory Towers: "Non-Ordinary Spellcaster" — a Spellcaster that casts any spell but an
// Ordinary one. (It used to parse as nothing, so the Earl couldn't cast at all.)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, castMagicFail, waiveThreshold, answer } from './helpers'
import { getKeywords } from '../src/cards/db'

describe('Earl of the Ivory Towers is a Non-Ordinary Spellcaster', () => {
  it('parses as a Spellcaster excluding Ordinary spells', () => {
    const kw = getKeywords('Earl of the Ivory Towers')
    expect(kw.spellcaster).toBe(true)
    expect(kw.spellcasterExcludeRarity).toBe('Ordinary')
  })

  it('casts Arcane Barrage (Elite)', () => {
    const g: any = newGame(); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Spire', 2, 1)
    const earl = summonCard(g, 0, 'Earl of the Ivory Towers', 2, 1)
    earl.enteredTurn = -1
    placeSite(g, 1, 'Spire', 3, 1)
    const foe = summonCard(g, 1, 'Bone Jumble', 3, 1)
    castMagic(g, 0, 'Arcane Barrage', { casterId: earl.id })
    answer(g, '1') // X = 1
    answer(g, 'e') // toward the foe, one square east
    expect(g.units[foe.id], 'the projectile from the Earl killed the 1/1').toBeUndefined()
  })

  it('cannot cast an Ordinary spell', () => {
    const g: any = newGame(); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Spire', 2, 1)
    const earl = summonCard(g, 0, 'Earl of the Ivory Towers', 2, 1)
    earl.enteredTurn = -1
    expect(castMagicFail(g, 0, 'Bone Spear', { casterId: earl.id })).toMatch(/cannot cast Ordinary/)
  })
})
