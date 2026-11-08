// Gnarled Wendigo: "This costs (2) less to cast for each minion you sacrifice at its summoning location."
// The sacrifice is part of the COST: the player picks which of their minions there to sacrifice (extra.sacrifice),
// and they die with the payment — even when the Wendigo enters disabled (atop a burrowed Root Spider, which also
// disables the Skeletons) and so fires no Genesis.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, injectToHand, waiveThreshold, act, actFail } from './helpers'
import { isDisabled } from '../src/engine/statics'
import { getCard } from '../src/cards/db'
import type { PlayerId } from '../src'
import '../src/cards/scripts/index'

const AT = { x: 2, y: 2, region: 'surface' as const }
function setup() {
  const g = newGame(); keepBoth(g)
  const p = g.activePlayer, q = (1 - p) as PlayerId
  placeSite(g, p, 'Rustic Village', 2, 2)
  const bones = [summonCard(g, p, 'Skeleton', 2, 2), summonCard(g, p, 'Skeleton', 2, 2)]
  const card = injectToHand(g, p, 'Gnarled Wendigo')
  waiveThreshold(g, p)
  g.players[p].mana = 20
  return { g, p, q, bones, card, cast: (extra?: any) => ({ t: 'castSpell' as const, cardId: card, casterId: g.players[p].avatarUnitId, at: AT, extra }) }
}
const FULL = getCard('Gnarled Wendigo').cost ?? 0

describe('Gnarled Wendigo', () => {
  it('sacrifices only the minions you pick, 2 less each', () => {
    const { g, p, bones, cast } = setup()
    act(g, p, cast({ sacrifice: [bones[0].id] }))
    expect(g.units[bones[0].id], 'picked → sacrificed').toBeFalsy()
    expect(g.units[bones[1].id], 'not picked → stays').toBeTruthy()
    expect(g.players[p].mana).toBe(20 - (FULL - 2))
  })

  it('picking none pays full price and keeps everyone', () => {
    const { g, p, bones, cast } = setup()
    act(g, p, cast({ sacrifice: [] }))
    for (const b of bones) expect(g.units[b.id]).toBeTruthy()
    expect(g.players[p].mana).toBe(20 - FULL)
  })

  it('rejects a pick that is not your minion there (or a duplicate)', () => {
    const { g, p, q, bones, cast } = setup()
    const foe = summonCard(g, q, 'Bone Jumble', 2, 2)
    actFail(g, p, cast({ sacrifice: [foe.id] }))
    actFail(g, p, cast({ sacrifice: [bones[0].id, bones[0].id] }))
    expect(g.units[foe.id] && g.units[bones[0].id]).toBeTruthy()
  })

  it('still sacrifices disabled Skeletons when the Wendigo itself enters disabled', () => {
    const { g, p, q, bones, cast } = setup()
    const spider = summonCard(g, q, 'Root Spider', 2, 2)
    spider.region = 'underground'
    for (const b of bones) expect(isDisabled(g, b)).toBe(true)
    act(g, p, cast({ sacrifice: bones.map((b) => b.id) }))
    const wendigo = Object.values(g.units).find((u) => u.name === 'Gnarled Wendigo')!
    expect(isDisabled(g, wendigo), 'the Wendigo is disabled on entry').toBe(true)
    for (const b of bones) expect(g.units[b.id], 'sacrificed anyway — it was the cost').toBeFalsy()
    expect(g.players[p].mana).toBe(20 - Math.max(0, FULL - 4))
  })
})
