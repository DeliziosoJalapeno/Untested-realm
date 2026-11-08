// Island Leviathan / Horns of Behemoth FAQ: "Assuming it was in the realm prior to the turn it
// awakened, it is not summoning sick" â€” a site played THIS turn awakens summoning sick.
import { describe, it, expect } from 'vitest'
import { newGame, act, keepBoth, answer, fetchToHand, injectToHand, placeSite } from './helpers'
import { avatarOf, canTap } from '../src'

function wake(name: string, ability: string, played: boolean) {
  const g = newGame()
  keepBoth(g)
  const v = fetchToHand(g, 0, 'Rustic Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v, x: 2, y: 0 })
  if (g.prompts.length) answer(g, false)
  let siteId: string
  if (played) {
    avatarOf(g, 0).tapped = false
    const card = injectToHand(g, 0, name)
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: card, x: 2, y: 1 })
    if (g.prompts.length) answer(g, false)
    siteId = Object.values(g.sites).find((s) => s.name === name)!.id
  } else {
    siteId = placeSite(g, 0, name, 2, 1).id // already in the realm
  }
  // the wake abilities need (W)×8 / (F)×6: activated-ability thresholds count real affinity
  for (let x = 0; x < 5; x++) for (const y of [2, 3]) placeSite(g, 0, name === 'Horns of Behemoth' ? 'Wasteland' : 'Stream', x, y)
  act(g, 0, { t: 'activate', sourceId: siteId, ability })
  const unit = Object.values(g.units).find((u) => u.name === name)!
  expect(unit).toBeDefined()
  return { g, unit }
}

describe('awakened sites and summoning sickness', () => {
  it('Island Leviathan played this turn awakens summoning sick', () => {
    const { g, unit } = wake('Island Leviathan', 'leviathan:wake', true)
    expect(unit.enteredTurn).toBe(g.turn)
    expect(canTap(g, unit)).toBe(false)
  })

  it('Island Leviathan already in the realm awakens ready', () => {
    const { g, unit } = wake('Island Leviathan', 'leviathan:wake', false)
    expect(unit.enteredTurn).toBeLessThan(g.turn)
    expect(canTap(g, unit)).toBe(true)
  })

  it('Horns of Behemoth played this turn awakens summoning sick', () => {
    const { g, unit } = wake('Horns of Behemoth', 'behemoth:wake', true)
    expect(canTap(g, unit)).toBe(false)
  })
})
