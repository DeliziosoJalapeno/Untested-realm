// Saint of Redemption's "all enter the realm tapped" is a triggered ability — a SILENCED or DISABLED Saint
// has none of its abilities, so entrants are no longer tapped. Silence is filtered at the emitEvent listener
// level; disable too (now centralised there). Tested through the real emit flow (not a direct hook call).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { emitEvent, type UnitState } from '../src'

describe('Saint of Redemption loses its tap-on-entry ability when silenced/disabled', () => {
  it('silenced or disabled Saint no longer taps entering minions', () => {
    const g = newGame(); keepBoth(g)
    const saint = summonCard(g, 0, 'Saint of Redemption', 2, 2)
    let n = 0
    const entersTapped = (): boolean => {
      const m: UnitState = summonCard(g, 0, 'Foot Soldier', (n++ % 5), 1); m.tapped = false
      emitEvent(g, 'onUnitEnters', m) // the real path the Saint reacts through
      return m.tapped
    }

    expect(entersTapped(), 'an active Saint taps entrants').toBe(true)

    saint.silenced = true
    expect(entersTapped(), 'a SILENCED Saint taps no one').toBe(false)

    saint.silenced = undefined
    saint.disabled = true
    expect(entersTapped(), 'a DISABLED Saint taps no one').toBe(false)
  })
})
