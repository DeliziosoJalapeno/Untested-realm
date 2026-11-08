// Codex, Silenced: "A silenced card loses its printed abilities … It retains its characteristics, its basic
// abilities, and any abilities it gains from other sources. If a minion already has a Stealth or Ward mark
// and then is affected by Silence, it will retain the mark! … If a site is Flooded via Floodplain, The
// Flood, Great Old One, etc. and then is silenced, it will still be Flooded" — only a PRINTED Flooded
// (Mismanaged Mortuary) is lost. Only DISABLED removes Stealth/Ward marks (Codex, Disabled / Ward).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { avatarOf, checkStateBased, applyFlood, dealDamageToUnit, isWaterSite, siteFlooded, siteSilenced, getCard, type GameState } from '../src'
import '../src/cards/scripts/index'

function game(): GameState {
  const g = newGame(); keepBoth(g)
  const a0 = avatarOf(g, 0); a0.x = 0; a0.y = 0
  const a1 = avatarOf(g, 1); a1.x = 4; a1.y = 3
  return g
}

describe('a silenced minion keeps its Ward and Stealth marks', () => {
  it('a warded minion silenced by Sisters of Silence keeps its Ward, and the Ward still works', () => {
    const g = game()
    placeSite(g, 0, 'Arid Desert', 2, 1); placeSite(g, 1, 'Arid Desert', 3, 1)
    summonCard(g, 1, 'Sisters of Silence', 3, 1)
    const u = summonCard(g, 0, 'Foot Soldier', 2, 1); u.ward = true
    checkStateBased(g)
    expect(u.silenced, 'hushed by the Sisters').toBe(true)
    expect(u.ward, 'Ward mark retained').toBe(true)
    dealDamageToUnit(g, u, 3, 1)
    expect(g.units[u.id], 'the Ward absorbed the blow').toBeTruthy()
    expect(g.units[u.id].damage).toBe(0)
    expect(g.units[u.id].ward, 'and broke').toBeFalsy()
  })

  it('a Stealthed minion silenced keeps its Stealth mark', () => {
    const g = game()
    placeSite(g, 0, 'Arid Desert', 2, 1); placeSite(g, 1, 'Arid Desert', 3, 1)
    summonCard(g, 1, 'Sisters of Silence', 3, 1)
    const u = summonCard(g, 0, 'Foot Soldier', 2, 1); u.stealth = true
    checkStateBased(g)
    expect(u.silenced).toBe(true)
    expect(u.stealth).toBe(true)
  })

  it('a DISABLED minion still loses both marks', () => {
    const g = game()
    placeSite(g, 0, 'Arid Desert', 2, 1); placeSite(g, 1, 'Arid Desert', 3, 1)
    summonCard(g, 1, 'Stone-gaze Gorgons', 3, 1) // disables adjacent minions
    const u = summonCard(g, 0, 'Foot Soldier', 2, 1); u.ward = true; u.stealth = true
    checkStateBased(g)
    expect(u.ward).toBeFalsy()
    expect(u.stealth).toBeFalsy()
  })

  it('a silenced site (Smokestacks of Gnaak) keeps its Ward mark', () => {
    const g = game()
    const s = placeSite(g, 0, 'Arid Desert', 2, 1); s.ward = true
    placeSite(g, 1, 'Smokestacks of Gnaak', 3, 1)
    checkStateBased(g)
    expect(siteSilenced(g, s)).toBe(true)
    expect(g.sites[s.id].ward).toBe(true)
  })
})

describe('Smokestacks of Gnaak: a granted flood survives the silence, a printed one does not', () => {
  it('a site flooded by another card stays flooded (and water) next to Smokestacks', () => {
    const g = game()
    const s = placeSite(g, 0, 'Arid Desert', 2, 1)
    applyFlood(g, s, 0)
    placeSite(g, 1, 'Smokestacks of Gnaak', 3, 1)
    checkStateBased(g)
    expect(siteSilenced(g, s)).toBe(true)
    expect(siteFlooded(g, s), 'granted flood kept').toBe(true)
    expect(isWaterSite(g, s, getCard)).toBe(true)
  })

  it('Mismanaged Mortuary loses its printed Flooded while silenced, and regains it when the silence ends', () => {
    const g = game()
    const m = placeSite(g, 0, 'Mismanaged Mortuary', 2, 1)
    expect(siteFlooded(g, m), 'printed Flooded').toBe(true)
    const smoke = placeSite(g, 1, 'Smokestacks of Gnaak', 3, 1)
    expect(siteFlooded(g, m), 'silenced → its own Flooded is gone').toBe(false)
    expect(isWaterSite(g, m, getCard)).toBe(false)
    delete g.sites[smoke.id]
    expect(siteFlooded(g, m)).toBe(true)
  })

  it('a Mortuary ALSO flooded by another card stays flooded while silenced', () => {
    const g = game()
    const m = placeSite(g, 0, 'Mismanaged Mortuary', 2, 1)
    applyFlood(g, m, 1)
    placeSite(g, 1, 'Smokestacks of Gnaak', 3, 1)
    expect(siteFlooded(g, m)).toBe(true)
  })
})
