import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, waiveThreshold } from './helpers'
import { effKeywords, validateTarget, getScript } from '../src'

describe('#1 Poison Nova respects magic immunity (Failed Mutation)', () => {
  it('a magic-immune minion is spared; a normal one dies', () => {
    const g = newGame(42, 0); keepBoth(g); waiveThreshold(g, 0)
    const av = g.units[g.players[0].avatarUnitId]
    placeSite(g, 0, 'Active Volcano', av.x, av.y)
    const immune = summonCard(g, 1, 'Failed Mutation', av.x, av.y); immune.enteredTurn = 0
    const mortal = summonCard(g, 1, 'Bone Jumble', av.x, av.y); mortal.enteredTurn = 0
    castMagic(g, 0, 'Poison Nova', {})
    expect(g.units[immune.id], "Failed Mutation can't be damaged by magic").toBeTruthy()
    expect(g.units[mortal.id], 'the normal minion is poisoned to death').toBeUndefined()
  })
})

describe('#3 Rebecks grants Charge to itself', () => {
  it('Rebecks (a Giant) has Charge from its own aura', () => {
    const g = newGame(42, 0); keepBoth(g)
    const rebecks = summonCard(g, 0, 'Rebecks', 2, 2); rebecks.enteredTurn = 0
    expect(effKeywords(g, g.units[rebecks.id]).charge, 'nearby allied Giants (incl. itself) have Charge').toBeTruthy()
  })
})

describe('#10 Lord of Lies cannot pick itself as a fighter (FAQ)', () => {
  it('validateTarget rejects the Lord as a target but accepts a nearby other unit', () => {
    const g = newGame(42, 0); keepBoth(g)
    for (const [x, y] of [[2, 2], [3, 2]] as const) placeSite(g, 0, 'Active Volcano', x, y)
    const lord = summonCard(g, 0, 'Lord of Lies', 2, 2); lord.enteredTurn = 0
    const other = summonCard(g, 1, 'Bone Jumble', 2, 2); other.enteredTurn = 0
    const spec = getScript('Lord of Lies')!.abilities![0].targets![0]
    expect(validateTarget(g, spec, { unit: lord.id }, lord, 0), 'the Lord itself is not a legal fighter').toBeTruthy()
    expect(validateTarget(g, spec, { unit: other.id }, lord, 0), 'a nearby other unit is legal').toBeNull()
  })
})
