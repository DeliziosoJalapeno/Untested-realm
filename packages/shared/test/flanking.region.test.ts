// Flanking Maneuver: "Teleport any number of allies at one location to another location a chess
// knight's move away." FAQ 1: a void/subsurface source may land on the DESTINATION site's
// surface/subsurface — the landing region is the one the caster picked for the destination, not
// forced to the source square's region.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { getScript } from '../src/cards/scripts/registry'
import { makeCtx } from '../src/engine/effects'

describe('Flanking Maneuver honors the destination region', () => {
  it('an underground source lands on the destination surface', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)     // source site (so 'underground' exists there)
    placeSite(g, 0, 'Spire', 3, 4)     // destination site (surface target)
    const ally = summonCard(g, 0, 'Bone Jumble', 2, 2, 'underground')

    // knight's move (2,2) -> (3,4): dx=1, dy=2. Source region underground, destination surface.
    const targets = [
      { square: { x: 2, y: 2, region: 'underground' as const } },
      { square: { x: 3, y: 4, region: 'surface' as const } },
    ]
    getScript('Flanking Maneuver')!.onCast!(makeCtx(g, '', 0, targets))

    expect(ally.x, 'moved to destination x').toBe(3)
    expect(ally.y, 'moved to destination y').toBe(4)
    expect(ally.region, 'landed on the destination SURFACE, not the source underground').toBe('surface')
  })

  it('selects units by the SOURCE region (underground movers, not surface ones)', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    placeSite(g, 0, 'Spire', 3, 4)
    const under = summonCard(g, 0, 'Bone Jumble', 2, 2, 'underground')
    const surface = summonCard(g, 0, 'Bone Jumble', 2, 2, 'surface') // NOT selected (different region)

    const targets = [
      { square: { x: 2, y: 2, region: 'underground' as const } },
      { square: { x: 3, y: 4, region: 'surface' as const } },
    ]
    getScript('Flanking Maneuver')!.onCast!(makeCtx(g, '', 0, targets))

    expect(under.x, 'the underground mover flanked').toBe(3)
    expect(surface.x, 'the surface unit stayed put (wrong source region)').toBe(2)
  })
})
