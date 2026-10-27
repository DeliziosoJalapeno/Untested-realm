// Iron Shackles: "Bearer is disabled." Drop is a basic ability and a disabled minion has none,
// so the bearer can't drop the Shackles (or anything else it carries).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, giveArtifact } from './helpers'
import { drop } from '../src'

describe('Iron Shackles — the bearer cannot drop', () => {
  it("a shackled minion can't drop the Shackles nor its other gear", () => {
    const g: any = newGame(); keepBoth(g)
    const u = summonCard(g, 0, 'Bone Jumble', 2, 2)
    const shackles = giveArtifact(g, u, 'Iron Shackles').id
    const lance = giveArtifact(g, u, 'Lance').id
    expect(drop(g, 0, u.id, [shackles])).toMatch(/disabled/)
    expect(drop(g, 0, u.id, [lance])).toMatch(/disabled/)
    expect(g.units[u.id].carrying).toEqual(expect.arrayContaining([shackles, lance]))
  })

  it('without the Shackles the same minion drops normally', () => {
    const g: any = newGame(); keepBoth(g)
    const u = summonCard(g, 0, 'Bone Jumble', 2, 2)
    const lance = giveArtifact(g, u, 'Lance').id
    expect(drop(g, 0, u.id, [lance])).toBeNull()
  })
})
