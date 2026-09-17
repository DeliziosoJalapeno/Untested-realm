// A Blightstone silenced by an aura (Acid Rain) loses its rules text and stops disabling its site.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, waiveThreshold } from './helpers'
import { siteDisabledByArtifact } from '../src/engine/statics'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

function groundArtifact(g: GameState, name: string, x: number, y: number, owner = 0): string {
  const cid = `ctest${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner } as any
  const aid = `atest${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name, conjuredBy: owner, x, y, region: 'surface', carriedBy: null, tapped: false } as any
  return aid
}

describe('Blightstone silence', () => {
  it('a silenced Blightstone stops disabling its site', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    groundArtifact(g, 'Blightstone', 2, 2)
    expect(siteDisabledByArtifact(g, { x: 2, y: 2 }), 'disabled while the Blightstone is active').toBe(true)

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Acid Rain', { at: { x: 2, y: 2 } }) // 2x2 aura silences artifacts here
    expect(siteDisabledByArtifact(g, { x: 2, y: 2 }), 'a silenced Blightstone no longer disables its site').toBe(false)
  })
})
