// Atlantean Fate / Flood: covered sites are flooded while the aura is in play, and MUST un-flood
// when the aura leaves (dispel / destroy). applyFlood sets a sticky per-site flag; the removal
// path (Dispel/Disenchant) now un-floods the sites the leaving aura had flooded.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { getScript } from '../src/cards/scripts/registry'
import { makeCtx } from '../src/engine/effects'
import { unfloodOnAuraLeave } from '../src/cards/scripts/multi-card-utils/dispel-script'

function makeAura(g: any, name: string, controller: number, squares: { x: number; y: number }[]): string {
  const cardId = `ca${g.nextId++}`
  const auraId = `ra${g.nextId++}`
  g.cards[cardId] = { id: cardId, name, owner: controller }
  g.auras[auraId] = { id: auraId, cardId, name, controller, squares, enteredTurn: 0 }
  return auraId
}

describe('Atlantean Fate un-floods on removal', () => {
  it('floods a covered non-Ordinary site, then un-floods it when dispelled', () => {
    const g: any = newGame(); keepBoth(g)
    const site = placeSite(g, 1, 'Active Volcano', 3, 3) // Exceptional (non-Ordinary)
    const auraId = makeAura(g, 'Atlantean Fate', 0, [{ x: 3, y: 3 }])
    getScript('Atlantean Fate')!.genesis!(makeCtx(g, auraId, 0, []))
    expect(site.flooded, 'the aura floods the covered non-Ordinary site').toBe(true)

    // dispel the aura at its square (caster must be within 2 steps — place caster on it)
    const caster = g.units[g.players[0].avatarUnitId]
    caster.x = 3; caster.y = 3; caster.region = 'surface'
    getScript('Dispel')!.onCast!(makeCtx(g, caster.id, 0, [{ square: { x: 3, y: 3, region: 'surface' } }]))

    expect(g.auras[auraId], 'the aura is gone').toBeUndefined()
    expect(site.flooded, 'the site un-floods once the aura leaves').toBeFalsy()
  })

  it('keeps a site flooded if a SECOND flooding aura still covers it', () => {
    const g: any = newGame(); keepBoth(g)
    const site = placeSite(g, 1, 'Active Volcano', 3, 3)
    const a1 = makeAura(g, 'Atlantean Fate', 0, [{ x: 3, y: 3 }])
    const a2 = makeAura(g, 'Flood', 0, [{ x: 3, y: 3 }])
    getScript('Atlantean Fate')!.genesis!(makeCtx(g, a1, 0, []))
    expect(site.flooded).toBe(true)

    // a1 leaves, but a2 (also a flooding aura) still covers the square → stays flooded
    unfloodOnAuraLeave(g, g.auras[a1])
    delete g.auras[a1]
    expect(site.flooded, 'still flooded — Flood aura remains').toBe(true)

    // now a2 leaves too → un-floods
    unfloodOnAuraLeave(g, g.auras[a2])
    delete g.auras[a2]
    expect(site.flooded, 'un-flooded once the last flooding aura is gone').toBeFalsy()
  })
})
