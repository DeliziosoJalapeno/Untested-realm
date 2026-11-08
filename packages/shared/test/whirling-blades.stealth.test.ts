// Whirling Blades on an Infiltrated minion: steps aren't an interaction, so it is still yours while it
// moves and when the enemies along its path are judged — its owner's minions are your enemies and are
// struck (all at once, FAQ). Striking IS an interaction: afterwards it loses Stealth and goes back to its
// owner. With no enemy on the path it strikes nothing and keeps its Stealth.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, summonCard, castMagic, answer, waiveThreshold } from './helpers'
import '../src/cards/scripts/index'

function setup() {
  const g = newGame(); keepBoth(g); fillSites(g); fillSites(g, 1)
  const p = g.activePlayer
  const q = (1 - p) as 0 | 1
  waiveThreshold(g, p)
  const spy = summonCard(g, q, 'Escyllion Cyclops', 2, 1)
  castMagic(g, p, 'Infiltrate', { targets: [spy.id] })
  return { g, p, q, spy }
}

describe('Whirling Blades and Stealth', () => {
  it('an Infiltrated minion strikes its owner\'s minions, then loses Stealth and returns to its owner', () => {
    const { g, p, q, spy } = setup()
    expect(spy.controller).toBe(p)
    const hisA = summonCard(g, q, 'Bone Jumble', 2, 2)
    const hisB = summonCard(g, q, 'Bone Jumble', 3, 2)
    const mine = summonCard(g, p, 'Bone Jumble', 4, 2)
    castMagic(g, p, 'Whirling Blades', { targets: [spy.id] })
    answer(g, { x: 2, y: 2, region: 'surface' })
    expect(g.units[spy.id].stealth, 'still Stealthed after a step').toBe(true)
    expect(g.units[spy.id].controller, 'still yours after a step').toBe(p)
    answer(g, { x: 3, y: 2, region: 'surface' })
    expect(g.units[hisA.id], 'its owner\'s minion on the path is struck').toBeUndefined()
    expect(g.units[hisB.id]).toBeUndefined()
    expect(g.units[mine.id], 'yours, off the path, untouched').toBeDefined()
    expect(g.units[spy.id].stealth).toBe(false)
    expect(g.units[spy.id].controller, 'back to its owner').toBe(q)
  })

  it('no enemy on the path: no strike, Stealth kept', () => {
    const { g, p, spy } = setup()
    castMagic(g, p, 'Whirling Blades', { targets: [spy.id] })
    answer(g, { x: 2, y: 2, region: 'surface' })
    answer(g, { x: 2, y: 2, region: 'surface' }) // stop
    expect(g.units[spy.id].stealth).toBe(true)
    expect(g.units[spy.id].controller).toBe(p)
  })
})
