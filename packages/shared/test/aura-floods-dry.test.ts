// A flooding aura (Atlantean Fate, Flood) floods its sites only while it covers them. Only Dispel dried
// them when the aura left: an aura that left any other way (destroyed by another effect, returned to
// hand, banished) left its sites flooded for good. The engine now ends an aura's floods however it goes —
// but never dries a site that something else flooded.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { applyFlood, checkStateBased, getScript, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

function fate(g: GameState) {
  const site = placeSite(g, 1, 'Active Volcano', 3, 3) // Exceptional: Atlantean Fate floods it
  const cardId = `ca${g.nextId++}`
  const auraId = `ra${g.nextId++}`
  g.cards[cardId] = { id: cardId, name: 'Atlantean Fate', owner: 0 }
  g.auras[auraId] = { id: auraId, cardId, name: 'Atlantean Fate', controller: 0, squares: [{ x: 3, y: 3 }], enteredTurn: 0 }
  getScript('Atlantean Fate')!.genesis!(makeCtx(g, auraId, 0, []))
  return { site, auraId, cardId }
}
const leave = (g: GameState, auraId: string) => {
  delete g.auras[auraId] // gone by any route but Dispel: no un-flood call of its own
  checkStateBased(g)
}

describe('a flooding aura that leaves the realm dries what it flooded', () => {
  it('Atlantean Fate gone (not dispelled): its site is no longer flooded', () => {
    const g = newGame() as GameState; keepBoth(g)
    const { site, auraId } = fate(g)
    expect(site.flooded).toBe(true)
    leave(g, auraId)
    expect(site.flooded).toBeFalsy()
  })

  it('a site already flooded before the aura stays flooded', () => {
    const g = newGame() as GameState; keepBoth(g)
    const before = placeSite(g, 1, 'Active Volcano', 3, 3)
    applyFlood(g, before, 1) // flooded in its own right (Great Old One, Avatar of Water…)
    delete g.sites[before.id]
    const { site, auraId } = fate(g)
    applyFlood(g, site, 1)
    leave(g, auraId)
    expect(site.flooded, 'something else flooded it').toBe(true)
  })

  it('a site flooded by something else while the aura was there stays flooded', () => {
    const g = newGame() as GameState; keepBoth(g)
    const { site, auraId } = fate(g)
    applyFlood(g, site, 1) // now flooded in its own right too
    leave(g, auraId)
    expect(site.flooded).toBe(true)
  })
})
