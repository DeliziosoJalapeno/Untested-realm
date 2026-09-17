// Panpipes of Pnom: "Damage caused by nearby units is increased to 2." FAQ: this raises a
// ZERO-power striker's damage to 2 as well ("Yes, this effect will cause zero power units to
// strike for 2 damage."). The guard used to floor at amount >= 1, skipping amount === 0.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, act } from './helpers'
import { getScript } from '../src/cards/scripts/registry'
import '../src/cards/scripts/index'

describe('Panpipes of Pnom boosts a 0-power strike', () => {
  it("raises a nearby striker's 0 damage to 2", () => {
    const g: any = newGame(); keepBoth(g)
    // Panpipes (grounded artifact) at (2,2)
    const art = { id: 'aPipes', cardId: 'cPipes', name: 'Panpipes of Pnom', conjuredBy: 0, x: 2, y: 2, region: 'surface', tapped: false }
    g.cards['cPipes'] = { id: 'cPipes', name: 'Panpipes of Pnom', owner: 0 }
    g.artifacts['aPipes'] = art
    // a 0-power striker on an adjacent square (nearby the Panpipes)
    const striker = summonCard(g, 0, 'Aethermoeba', 3, 2, 'surface') // 0/0
    const victim = summonCard(g, 1, 'Bone Jumble', 3, 2, 'surface')

    const mod = getScript('Panpipes of Pnom')!.damageBoost!
    const source = { player: 0 as const, kind: 'strike' as const, attackerId: striker.id, name: striker.name }
    const boosted = mod(g, art.id, victim, 0, source)
    expect(boosted, 'a 0-power nearby strike is raised to 2').toBe(2)
  })

  it('does not boost a striker that is NOT nearby', () => {
    const g: any = newGame(); keepBoth(g)
    const art = { id: 'aPipes', cardId: 'cPipes', name: 'Panpipes of Pnom', conjuredBy: 0, x: 2, y: 2, region: 'surface', tapped: false }
    g.cards['cPipes'] = { id: 'cPipes', name: 'Panpipes of Pnom', owner: 0 }
    g.artifacts['aPipes'] = art
    const striker = summonCard(g, 0, 'Aethermoeba', 4, 4, 'surface') // far away
    const victim = summonCard(g, 1, 'Bone Jumble', 4, 4, 'surface')

    const mod = getScript('Panpipes of Pnom')!.damageBoost!
    const source = { player: 0 as const, kind: 'strike' as const, attackerId: striker.id, name: striker.name }
    const res = mod(g, art.id, victim, 0, source)
    expect(res, 'a far strike is unchanged (still 0)').toBe(0)
  })
})
