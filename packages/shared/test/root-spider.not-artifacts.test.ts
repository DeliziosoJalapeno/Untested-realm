// Root Spider: "While Root Spider is burrowed, minions directly above it are disabled." Only minions —
// an Omphalos (a spellcaster ARTIFACT) sitting above it keeps casting, even though it casts through a
// positioned pseudo-unit.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, giveMana, waiveThreshold, injectToHand, summonCard, placeSite } from './helpers'
import { canCast, isDisabled } from '../src'

describe('Root Spider disables only minions above it', () => {
  it('an Omphalos above a burrowed Root Spider still casts', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const artCard = `co${g.nextId++}`
    g.cards[artCard] = { id: artCard, name: 'Char Omphalos', owner: 0 }
    const artId = `ao${g.nextId++}`
    g.artifacts[artId] = { id: artId, cardId: artCard, name: 'Char Omphalos', conjuredBy: 0, x: 2, y: 1, region: 'surface', tapped: false }
    summonCard(g, 1, 'Root Spider', 2, 1, 'underground')
    const bears = summonCard(g, 0, 'Brown Bears', 2, 1)
    expect(isDisabled(g, bears), 'a minion above it is disabled').toBe(true)
    const own = injectToHand(g, 0, 'Fireball')
    g.flow = g.flow ?? {}
    g.flow.lockedCards = [{ cardId: own, casterId: artId, grantsCasting: false }]
    expect(canCast(g, 0, own, artId).ok, 'its own drawn spell').toBe(true)
    const fire = injectToHand(g, 0, 'Fireball')
    expect(canCast(g, 0, fire, artId).ok, 'a hand spell of its element').toBe(true)
  })
})

describe("Gargantula's Genesis doesn't target", () => {
  it('drags in a warded or stealthy enemy anyway', async () => {
    const { getScript, makeCtx } = await import('../src')
    await import('../src/cards/scripts/index')
    for (const status of ['ward', 'stealth'] as const) {
      const g: any = newGame(); keepBoth(g); placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 1, 'Spire', 2, 2)
      const spider = summonCard(g, 0, 'Gargantula', 2, 1)
      const prey = summonCard(g, 1, 'Brown Bears', 2, 2)
      prey[status] = true
      getScript('Gargantula')!.genesis!(makeCtx(g, spider.id, 0, [{ unit: prey.id }]))
      expect([prey.x, prey.y], status).toEqual([2, 1])
      expect(prey.counters?.cocooned, status).toBe(1)
    }
  })
})
