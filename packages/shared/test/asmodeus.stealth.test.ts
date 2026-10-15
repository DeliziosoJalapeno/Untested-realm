// Asmodeus / Frozen Horror: their ability is "Break Stealth → <effect>". Activating ANY ability already
// breaks Stealth in the engine (Codex — Stealth: interacting with the realm), so the effect must not re-check
// self.stealth — it's already false by the time the effect runs. Bug was: engine broke Stealth, then the
// effect saw no Stealth and logged "no Stealth to break", doing nothing. It's gated to require Stealth.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, actFail } from './helpers'

describe('Asmodeus — Break Stealth destroys everything here (not a no-op)', () => {
  it('activating with Stealth destroys co-located enemies + the site, and he survives', () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Hamlet', 2, 2)
    const asmo = summonCard(g, 0, 'Asmodeus', 2, 2); asmo.enteredTurn = -1; asmo.tapped = false; asmo.stealth = true
    const enemy = summonCard(g, 1, 'Foot Soldier', 2, 2); enemy.enteredTurn = -1

    act(g, 0, { t: 'activate', sourceId: asmo.id, ability: 'immolate' })

    expect(g.units[enemy.id], 'the co-located enemy is destroyed').toBeUndefined()
    expect(g.sites[site.id], 'the site is destroyed (→ rubble)').toBeFalsy()
    expect(g.units[asmo.id], 'Asmodeus himself survives ("everything ELSE")').toBeTruthy()
    expect(g.units[asmo.id].stealth, 'his Stealth is broken').toBeFalsy()
  })

  it('without Stealth the ability is not available (nothing to break)', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Hamlet', 2, 2)
    const asmo = summonCard(g, 0, 'Asmodeus', 2, 2); asmo.enteredTurn = -1; asmo.tapped = false; asmo.stealth = false

    const err = actFail(g, 0, { t: 'activate', sourceId: asmo.id, ability: 'immolate' })
    expect(err, 'rejected — no Stealth to break').toBeTruthy()
  })
})

describe('Frozen Horror — Break Stealth freezes nearby (not a no-op)', () => {
  it('activating with Stealth disables a nearby enemy and breaks his Stealth', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Hamlet', 2, 2); placeSite(g, 0, 'Hamlet', 2, 1)
    const fh = summonCard(g, 0, 'Frozen Horror', 2, 2); fh.enteredTurn = -1; fh.tapped = false; fh.stealth = true
    const enemy = summonCard(g, 1, 'Foot Soldier', 2, 1); enemy.enteredTurn = -1

    act(g, 0, { t: 'activate', sourceId: fh.id, ability: 'terror' })

    expect(g.units[fh.id].stealth, 'his Stealth is broken').toBeFalsy()
    expect(g.units[enemy.id]?.modifiers.some((m: any) => m.keyword === 'disabled'),
      'the nearby enemy is frozen (disabled)').toBe(true)
  })
})
