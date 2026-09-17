// The Flood (Great Old One): "Permanently flood the entire realm, including voids. Submerge
// everything except one minion of each type."
//   (a) A minion is ALL of its types at once, so saving a Dragon+Undead uses up BOTH slots —
//       you can only save ONE Dragon even if a second Dragon also has another type (FAQ).
//   (b) The realm stays flooded forever: rubble and sites that enter later are flooded too.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, answer, castMagic, waiveThreshold } from './helpers'
import { getScript } from '../src/cards/scripts/registry'
import { makeCtx } from '../src/engine/effects'
import { enterSite } from '../src/engine/casting'

describe('The Flood — one save per shared type', () => {
  it('saves only one Dragon even when a second Dragon shares another type', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    placeSite(g, 0, 'Spire', 3, 3)
    const bonekite = summonCard(g, 0, 'Draconian Bonekite', 2, 2, 'surface') // [Dragon, Undead]
    const ancient = summonCard(g, 0, 'Ancient Dragon', 3, 3, 'surface')       // [Dragon]

    waiveThreshold(g, 0)
    castMagic(g, 0, 'The Flood') // real cast so the 'ark' continuation is registered
    // a Dragon prompt fires (two Dragons) — save the Ancient Dragon
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    answer(g, [ancient.id])

    // exactly ONE of the two Dragons stays on the surface; the other is NOT (submerged or drowned)
    const surfaced = [bonekite, ancient].filter((u) => g.units[u.id]?.region === 'surface')
    expect(surfaced.length, 'only one Dragon saved from the flood').toBe(1)
    expect(g.units[ancient.id]?.region, 'the chosen Dragon stays up').toBe('surface')
    expect(g.units[bonekite.id]?.region, 'the second Dragon (also Undead) is not on the surface').not.toBe('surface')
  })
})

describe('The Flood — persistent realm flood', () => {
  it('floods a site that enters the realm AFTER the flood', () => {
    const g: any = newGame(); keepBoth(g)
    // The Flood resolves and rests in the cemetery, where it keeps listening (listensFromCemetery)
    const floodId = `cflood${g.nextId++}`
    g.cards[floodId] = { id: floodId, name: 'The Flood', owner: 0 }
    g.players[0].cemetery.push(floodId)
    getScript('The Flood')!.onCast!(makeCtx(g, '', 0, []))
    expect(g.flow.realmFlooded, 'the persistent realm-flood flag is set').toBe(true)

    // play a NEW site after the flood — it should enter already flooded
    const cardId = `cnew${g.nextId++}`
    g.cards[cardId] = { id: cardId, name: 'Spire', owner: 0 }
    const siteId = enterSite(g, 0, cardId, 4, 4)
    expect(g.sites[siteId]?.flooded, 'a later-entering site is flooded by the lingering Flood').toBe(true)
  })

  it('floods rubble at cast time', () => {
    const g: any = newGame(); keepBoth(g)
    const rubble = placeSite(g, 0, 'Spire', 1, 1)
    rubble.isRubble = true
    getScript('The Flood')!.onCast!(makeCtx(g, '', 0, []))
    expect(rubble.flooded, 'rubble in the realm floods too').toBe(true)
  })
})
