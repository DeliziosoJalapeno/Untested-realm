// Drowning is CENTRAL: any non-Submerge minion that ends up underwater and dies for it has drowned,
// however it got there. Drown (forcedSubsurface) sets region=underwater and lets checkStateBased kill it —
// that death must still fire onDrowned so Watery Grave ("whenever an enemy drowns nearby, raise a Skeleton")
// hears it. Previously onDrowned only fired inside trySubmerge, so Drown-ing a minion raised no Skeleton.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, waiveThreshold } from './helpers'

describe('drowning fires onDrowned however the minion got underwater', () => {
  it('Drown-ing an enemy on a water site near a Watery Grave raises a Skeleton', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Watery Grave', 2, 2)
    placeSite(g, 0, 'Pond', 2, 3) // a water site NEARBY the grave
    waiveThreshold(g, 0)
    const victim = summonCard(g, 1, 'Bone Jumble', 2, 3); victim.enteredTurn = -5 // enemy, no Submerge

    castMagic(g, 0, 'Drown', { targets: [victim.id] })

    expect(g.units[victim.id], 'the non-Submerge minion drowned').toBeUndefined()
    const skelly = Object.values(g.units).find((u: any) => u.name === 'Skeleton' && u.controller === 0 && u.x === 2 && u.y === 3)
    expect(skelly, 'Watery Grave heard the drown and raised a Skeleton atop the site').toBeTruthy()
  })
})
