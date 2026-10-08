// "target water/land site" magics expose an engine-authoritative candidate set (targetOptions) so the
// client glows exactly the legal sites. This also pins down what the OLD per-candidate validateTarget
// path returned, for comparison.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { legalTargetOptions, validateTarget, getScript, avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

function board() {
  const g = newGame() as GameState; keepBoth(g)
  const water = placeSite(g, 0, 'Aqueduct', 1, 1)       // a water site
  const land = placeSite(g, 0, 'Rustic Village', 3, 1)  // a land site
  return { g, water, land, av: avatarOf(g, 0) }
}

describe('Stormy Seas (target water site)', () => {
  it('targetOptions = exactly the water sites', () => {
    const { g, water, land } = board()
    const opts = legalTargetOptions(g, getScript('Stormy Seas')!, avatarOf(g, 0), [], 0)
    expect(opts?.some((o) => 'site' in o && o.site === water.id), 'the water site is a candidate').toBe(true)
    expect(opts?.some((o) => 'site' in o && o.site === land.id), 'the land site is not').toBe(false)
  })

  it('the OLD validateTarget-per-site path agrees (water legal, land rejected)', () => {
    const { g, water, land, av } = board()
    const spec = getScript('Stormy Seas')!.targets![0]
    // this is exactly what the client glow loop did: no error (null) ⇒ legal ⇒ glows
    expect(validateTarget(g, spec, { site: water.id }, av, 0), 'water site passes').toBeNull()
    expect(validateTarget(g, spec, { site: land.id }, av, 0), 'land site is rejected').not.toBeNull()
  })
})

describe('Cave-In (target land site)', () => {
  it('targetOptions = exactly the land sites', () => {
    const { g, water, land } = board()
    const opts = legalTargetOptions(g, getScript('Cave-In')!, avatarOf(g, 0), [], 0)
    expect(opts?.some((o) => 'site' in o && o.site === land.id), 'the land site is a candidate').toBe(true)
    expect(opts?.some((o) => 'site' in o && o.site === water.id), 'the water site is not').toBe(false)
  })
})
