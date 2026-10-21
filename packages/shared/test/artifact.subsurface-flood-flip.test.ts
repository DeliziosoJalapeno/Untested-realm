// The underground and underwater levels of a square are the same subsurface: when a site floods, a
// buried ground artifact there becomes sunken (underwater), and when it's drained it becomes buried again.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { checkStateBased } from '../src'

function groundArtifact(g: any, owner: 0 | 1, name: string, x: number, y: number, region: string) {
  const c = `ca${g.nextId++}`; g.cards[c] = { id: c, name, owner }
  const id = `aa${g.nextId++}`
  g.artifacts[id] = { id, cardId: c, name, conjuredBy: owner, x, y, region, carriedBy: null, tapped: false }
  return id
}

describe('ground artifacts follow the subsurface terrain', () => {
  it('a buried artifact becomes underwater when its site floods', () => {
    const g: any = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Active Volcano', 2, 1)
    const art = groundArtifact(g, 1, 'Lance', 2, 1, 'underground')
    site.flooded = true
    checkStateBased(g)
    expect(g.artifacts[art]?.region).toBe('underwater')
  })

  it('a sunken artifact becomes underground when its site is no longer water', () => {
    const g: any = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Active Volcano', 2, 1); site.flooded = true
    const art = groundArtifact(g, 1, 'Lance', 2, 1, 'underwater')
    checkStateBased(g)
    expect(g.artifacts[art]?.region, 'still water: unchanged').toBe('underwater')
    site.flooded = false
    checkStateBased(g)
    expect(g.artifacts[art]?.region).toBe('underground')
  })

  it('surface artifacts are untouched', () => {
    const g: any = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Active Volcano', 2, 1)
    const art = groundArtifact(g, 1, 'Lance', 2, 1, 'surface')
    site.flooded = true
    checkStateBased(g)
    expect(g.artifacts[art]?.region).toBe('surface')
  })
})
