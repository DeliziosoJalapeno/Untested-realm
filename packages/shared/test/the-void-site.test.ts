// "The Void" — "This site is also void." Its surface and subsurface also count as void, so a minion
// WITHOUT Voidwalk standing on it is banished (FAQ), while a Voidwalk minion survives there.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { checkStateBased } from '../src'

describe('The Void site — banishes non-Voidwalk minions on it', () => {
  it('banishes a plain minion cast onto The Void', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'The Void', 2, 2)
    const m = summonCard(g, 0, 'Bone Jumble', 2, 2) // no Voidwalk
    checkStateBased(g)
    expect(g.units[m.id], 'the minion was banished by the void').toBeUndefined()
  })

  it('a Voidwalk minion survives on The Void', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'The Void', 2, 2)
    const h = summonCard(g, 0, 'Hounds of Ondaros', 2, 2) // Voidwalk
    checkStateBased(g)
    expect(g.units[h.id], 'a Voidwalker is unharmed').toBeTruthy()
  })

  it('banishes a non-Voidwalk minion on The Void subsurface too', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'The Void', 1, 1)
    const m = summonCard(g, 0, 'Bone Jumble', 1, 1, 'underground')
    checkStateBased(g)
    expect(g.units[m.id], 'subsurface of The Void is also void').toBeUndefined()
  })

  it('a plain minion on a NORMAL site is unaffected', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const m = summonCard(g, 0, 'Bone Jumble', 3, 3)
    checkStateBased(g)
    expect(g.units[m.id], 'a normal site is not void').toBeTruthy()
  })
})
