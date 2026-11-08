// Varmint Warrens: "Beasts here can't be targeted by enemies." An attack targets the unit it is declared on,
// so an enemy can't attack a Beast at the Warrens either (FAQ: "enemies" are the Beast's enemies).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, actFail } from './helpers'
import type { PlayerId } from '../src'
import '../src/cards/scripts/index'

function setup() {
  const g = newGame(); keepBoth(g)
  const p = g.activePlayer, q = (1 - p) as PlayerId
  placeSite(g, p, 'Rustic Village', 2, 1)
  placeSite(g, q, 'Varmint Warrens', 2, 2)
  const attacker = summonCard(g, p, 'Bosk Troll', 2, 2); attacker.enteredTurn = -1 // already on the Warrens' square
  return { g, p, q, attacker }
}

describe('Varmint Warrens shields Beasts from attacks', () => {
  it("an enemy can't attack a Beast there", () => {
    const { g, p, q, attacker } = setup()
    const wolves = summonCard(g, q, 'Grey Wolves', 2, 2)
    actFail(g, p, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: wolves.id } } as any)
    expect(g.units[wolves.id].damage).toBe(0)
  })

  it('a non-Beast there can still be attacked', () => {
    const { g, p, q, attacker } = setup()
    const soldier = summonCard(g, q, 'Foot Soldier', 2, 2)
    act(g, p, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: soldier.id } } as any)
  })

  it('a silenced Warrens shields nothing', () => {
    const { g, p, q, attacker } = setup()
    const wolves = summonCard(g, q, 'Grey Wolves', 2, 2)
    // a site silence centred on the neighbouring site covers the Warrens (as Smokestacks of Gnaak does)
    const neighbour = Object.values(g.sites).find((s) => s.x === 2 && s.y === 1)!
    g.flow = { ...(g.flow ?? {}), siteSilences: [{ siteId: neighbour.id }] } as any
    act(g, p, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: wolves.id } } as any)
  })
})
