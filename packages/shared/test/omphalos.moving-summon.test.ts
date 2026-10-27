// An Omphalos's minions "must be summoned here": "here" is wherever the Omphalos IS when the
// minion is cast, not where it was when it drew the spell (a Cloud City may fly it elsewhere).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, giveMana, waiveThreshold, placeSite } from './helpers'
import { castSpell, makeCtx } from '../src'
import { omphalosEndOfTurn } from '../src/cards/scripts/multi-card-utils/omphalos-end-of-turn'

function setup() {
  const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
  placeSite(g, 0, 'Arid Desert', 2, 1)
  placeSite(g, 0, 'Arid Desert', 3, 2)
  const artCard = `co${g.nextId++}`
  g.cards[artCard] = { id: artCard, name: 'Char Omphalos', owner: 0 }
  const artId = `ao${g.nextId++}`
  g.artifacts[artId] = { id: artId, cardId: artCard, name: 'Char Omphalos', conjuredBy: 0, x: 2, y: 1, region: 'surface', tapped: false }
  const minion = `cm${g.nextId++}`
  g.cards[minion] = { id: minion, name: 'Hellhounds', owner: 0 }
  g.players[0].spellbook.unshift(minion)
  omphalosEndOfTurn(makeCtx(g, artId, 0, []), 'Char Omphalos')
  expect(g.players[0].hand).toContain(minion)
  return { g, artId, minion }
}

describe('Omphalos: minions are summoned where it is now', () => {
  it('after the Omphalos moves, its minion summons at the new square, not the old one', () => {
    const { g, artId, minion } = setup()
    g.artifacts[artId].x = 3; g.artifacts[artId].y = 2 // carried off (Cloud City)
    expect(castSpell(g, 0, minion, artId, { x: 2, y: 1, region: 'surface' })).toMatch(/bound location/)
    expect(castSpell(g, 0, minion, artId, { x: 3, y: 2, region: 'surface' })).toBeNull()
    expect(Object.values(g.units).some((u: any) => u.name === 'Hellhounds' && u.x === 3 && u.y === 2)).toBe(true)
  })

  it('still summons at its square when it stays put', () => {
    const { g, artId, minion } = setup()
    expect(castSpell(g, 0, minion, artId, { x: 3, y: 2, region: 'surface' })).toMatch(/bound location/)
    expect(castSpell(g, 0, minion, artId, { x: 2, y: 1, region: 'surface' })).toBeNull()
  })
})
