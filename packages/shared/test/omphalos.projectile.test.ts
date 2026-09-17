// Regression: an Omphalos is a spellcaster ARTIFACT, so ctx.caster used to be undefined when it
// cast a spell that fires from the caster's board position (Magic Missiles, Ball Lightning, any
// projectile) — "cannot read properties of undefined (reading 'x')". makeCtx now synthesizes a
// positioned pseudo-unit for a spellcaster artifact, so the shot originates at the Omphalos.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, giveMana, waiveThreshold, injectToHand, summonCard, placeSite, act } from './helpers'

function omphalos(g: any, name: string, x: number, y: number) {
  const artCard = `co${g.nextId++}`
  g.cards[artCard] = { id: artCard, name, owner: 0 }
  const artId = `ao${g.nextId++}`
  g.artifacts[artId] = { id: artId, cardId: artCard, name, conjuredBy: 0, x, y, region: 'surface', tapped: false }
  return artId
}

describe('Omphalos casting a projectile spell', () => {
  it('Dank Omphalos fires Magic Missiles from its own square (no undefined-caster crash)', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const artId = omphalos(g, 'Dank Omphalos', 1, 1) // Air+Water spellcaster; Magic Missiles is Air
    for (const x of [1, 2, 3]) placeSite(g, 0, 'Active Volcano', x, 1) // the ray must travel over sites
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 1); foe.enteredTurn = 0 // 6/6 — survives 3

    const cardId = injectToHand(g, 0, 'Magic Missiles')
    // before the fix this threw inside onCast on `ctx.caster.x`; act() would surface it
    act(g, 0, { t: 'castSpell', cardId, casterId: artId, extra: { direction: 'e' } })

    expect(g.units[foe.id]?.damage, '3 missiles × 1, all fired from the Omphalos at (1,1)').toBe(3)
  })
})
