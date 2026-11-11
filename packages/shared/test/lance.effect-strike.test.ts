import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, answer, waiveThreshold, giveArtifact } from './helpers'

describe('a Lance counts on a strike an effect makes', () => {
  it('Whirling Blades: the lance adds +1 to each strike, then breaks', () => {
    const g = newGame(42, 0); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    const knight = summonCard(g, 0, 'Escyllion Cyclops', 2, 2); knight.enteredTurn = 0 // 6 power
    giveArtifact(g, knight, 'Lance')
    const lances = () => knight.carrying.filter((id) => g.artifacts[id]?.name === 'Lance')
    expect(lances().length).toBe(1)
    const a = summonCard(g, 1, 'Conqueror Worm', 2, 2); a.enteredTurn = 0
    const b = summonCard(g, 1, 'Conqueror Worm', 2, 2); b.enteredTurn = 0
    castMagic(g, 0, 'Whirling Blades', { targets: [knight.id] })
    answer(g, { x: 2, y: 2 }) // stop on own square → straight to the strikes (the 8/8s survive 6 + 1)
    expect(g.units[a.id]?.damage).toBe(7)
    expect(g.units[b.id]?.damage).toBe(7)
    expect(lances(), 'the lance broke after the blow').toEqual([])
  })
})
