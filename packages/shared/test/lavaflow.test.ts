import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, answer, giveMana, waiveThreshold } from './helpers'
import { avatarOf } from '../src'

// 'Lava flows from the caster's SITE in a cardinal direction. Deal damage to each other unit
// occupying a site in the area of effect' — card diagram 2/4/5 (5 nearest the source).
// So the caster's OWN site is the first cell (5), then 4, then 2 outward — the caster itself is
// spared ("each OTHER unit"), but other units on its site take 5. It hits units occupying those
// sites in ANY region (surface + burrowed underground + submerged underwater).

describe('Lava Flow', () => {
  function setup() {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    // caster (avatar) on its site at the west edge; the flow goes EAST along row 0
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    for (const x of [0, 1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 0)
    return g
  }

  it("hits the caster's OWN site (5) and the squares ahead (4 / 2), across all regions", () => {
    const g = setup()
    // 3rd cell needs WATER for a legally-submerged unit
    const s2 = Object.values(g.sites).find((s: any) => s.x === 2 && s.y === 0) as any
    delete g.sites[s2.id]; placeSite(g, 0, 'Stream', 2, 0)
    const onCasterSite = summonCard(g, 1, 'Escyllion Cyclops', 0, 0)         // OTHER unit on caster's site → 5
    const ahead1 = summonCard(g, 1, 'Dirium Fomorians', 1, 0, 'underground') // burrowed → 4
    const ahead2 = summonCard(g, 1, 'Dirium Fomorians', 2, 0, 'underwater')  // submerged → 2
    const caster = avatarOf(g, 0)
    castMagic(g, 0, 'Lava Flow')
    answer(g, 'e') // flow east
    expect(g.units[onCasterSite.id]?.damage, "the caster's own site is NOT untouched — other units there take 5").toBe(5)
    expect(g.units[ahead1.id]?.damage, 'BURROWED unit one square ahead takes 4').toBe(4)
    expect(g.units[ahead2.id]?.damage, 'SUBMERGED unit two squares ahead takes 2').toBe(2)
    expect(g.units[caster.id]?.damage ?? 0, 'the caster ITSELF is spared ("each other unit")').toBe(0)
  })

  it('spares sites off the flow line, and the flow reaches only 3 squares (site + 2 ahead)', () => {
    const g = setup()
    placeSite(g, 0, 'Rustic Village', 0, 1) // perpendicular to the east flow
    const offLine = summonCard(g, 1, 'Escyllion Cyclops', 0, 1)
    const tooFar = summonCard(g, 1, 'Escyllion Cyclops', 3, 0) // 3 squares ahead → out of range now
    castMagic(g, 0, 'Lava Flow')
    answer(g, 'e')
    expect(g.units[offLine.id]?.damage ?? 0, 'a site off the flow line is untouched').toBe(0)
    expect(g.units[tooFar.id]?.damage ?? 0, 'the 4th square (caster site + only 2 ahead) is out of range').toBe(0)
  })

  it('only damages units that occupy a SITE (a unit on a siteless square is spared)', () => {
    const g = setup()
    const siteId = Object.values(g.sites).find((s: any) => s.x === 1 && s.y === 0) as any
    delete g.sites[siteId.id] // (1,0) now has no site
    const noSite = summonCard(g, 1, 'Escyllion Cyclops', 1, 0)
    castMagic(g, 0, 'Lava Flow')
    answer(g, 'e')
    expect(g.units[noSite.id]?.damage ?? 0, 'a unit not occupying a site is unharmed').toBe(0)
  })
})
