// Minion damage numbers: flow.unitDamage records a hit on a minion ONLY when it comes from a NON-AREA
// effect (a ranged strike, a single projectile, a targeted spell or ability). Melee strikes (the battle
// panel shows them) and AREA effects (printed areas, Balor's gaze, lines/volleys of projectiles, and any
// spell/ability/trigger whose hits spread over several untargeted units) keep their big numbers on the
// sites instead. An ability sealed before its effect lands drops the stand-in glow on its own site.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer, castMagic, waiveThreshold } from './helpers'
import { dealDamageToUnit, checkStateBased, asAreaDamage, fireVolleyProjectiles, recordUnitDamage, settleUnitDamage, beginAreaReveal } from '../src'

// what the client is shown, once the action has settled (applyAction does this at its boundary)
const hits = (g: any) => (settleUnitDamage(g), (g.flow?.unitDamage ?? []) as { unitId: string; amount: number }[]).map((h) => `${h.unitId}:${h.amount}`)
const cells = (g: any) => ((g.flow?.areaReveal?.cells ?? []) as { x: number; y: number; dmg: number }[]).map((c) => `${c.x},${c.y}:${c.dmg}`)

function board() {
  const g: any = newGame(); keepBoth(g)
  for (const x of [0, 1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 1)
  const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 1) // 6/6
  waiveThreshold(g, 0)
  return { g, foe }
}

describe('minion damage numbers: non-area hits only', () => {
  it('a spell / ability / effect / ranged hit on a minion is recorded with its final amount', () => {
    for (const kind of ['magic', 'effect', 'ability', 'projectile'] as const) {
      const { g, foe } = board()
      dealDamageToUnit(g, foe, 3, 0, { source: { player: 0, kind } as any })
      expect(hits(g), kind).toEqual([`${foe.id}:3`])
    }
  })

  it('a melee strike is not (the battle panel shows it)', () => {
    const { g, foe } = board()
    dealDamageToUnit(g, foe, 3, 0, { source: { player: 0, kind: 'strike' } as any })
    expect(hits(g)).toEqual([])
  })

  it('area damage is not', () => {
    const { g, foe } = board()
    asAreaDamage(g, () => dealDamageToUnit(g, foe, 3, 0))
    expect(hits(g)).toEqual([])
    expect(g.flow.areaDamaging, 'the flag is cleared afterwards').toBeFalsy()
    dealDamageToUnit(g, foe, 1, 0)
    expect(hits(g)).toEqual([`${foe.id}:1`])
  })

  it('a lethal hit is still recorded (the number floats over the dying card)', () => {
    const { g, foe } = board()
    dealDamageToUnit(g, foe, 9, 0); checkStateBased(g)
    expect(g.units[foe.id]).toBeUndefined()
    expect(hits(g)).toEqual([`${foe.id}:9`])
  })

  it('a targeted single-unit spell (Lightning Bolt) puts its number on the minion', () => {
    const { g, foe } = board()
    castMagic(g, 0, 'Lightning Bolt', { targets: ['sq:2,1'] })
    expect(hits(g)).toEqual([`${foe.id}:3`])
    expect(cells(g)).toEqual([])
  })

  it('a mass spell (Rain of Arrows) is an area: big numbers on the sites, none on the minions', () => {
    const { g, foe } = board()
    const other = summonCard(g, 1, 'Escyllion Cyclops', 3, 1)
    castMagic(g, 0, 'Rain of Arrows')
    expect(g.units[foe.id].damage).toBe(1)
    expect(hits(g)).toEqual([])
    expect(cells(g)).toEqual(expect.arrayContaining(['2,1:1', '3,1:1']))
    expect(g.units[other.id].damage).toBe(1)
  })

  it('Balor\'s gaze is an area: big numbers on the gazed sites, none on the minions; its own site drops the stand-in glow', () => {
    const { g, foe } = board()
    const balor = summonCard(g, 0, 'Balor of the Evil Eye', 0, 1)
    balor.enteredTurn = -1
    summonCard(g, 1, 'Escyllion Cyclops', 3, 1)
    act(g, 0, { t: 'activate', sourceId: balor.id, ability: 'gaze' })
    expect(g.flow.areaReveal.redSites, 'before the direction: Balor\'s site stands in').toEqual([{ x: 0, y: 1 }])
    answer(g, 'e')
    expect(g.units[foe.id].damage).toBe(2)
    expect(hits(g)).toEqual([])
    expect(cells(g)).toEqual(['2,1:2', '3,1:2'])
    expect(g.flow.areaReveal.redSites, 'Balor\'s own site is no longer lit as if hit').toEqual([])
  })

  it('a Genesis hitting every nearby unit (Flayer) is an area: site numbers, none on the minions', () => {
    const { g, foe } = board()
    const near = summonCard(g, 1, 'Escyllion Cyclops', 1, 1)
    castMagic(g, 0, 'Flayer', { at: { x: 1, y: 1 } })
    expect(g.units[foe.id].damage).toBe(1)
    expect(g.units[near.id].damage).toBe(1)
    expect(hits(g)).toEqual([])
    expect(cells(g)).toEqual(expect.arrayContaining(['1,1:1', '2,1:1']))
  })

  it('a lone projectile is a single hit (number on the minion); a volley of several is an area', () => {
    const one = board()
    beginAreaReveal(one.g)
    fireVolleyProjectiles(one.g, { player: 0, ox: 0, oy: 1, region: 'surface', dir: 'e', volleys: 1, damage: 2, srcName: 'Test Shot' })
    expect(hits(one.g)).toEqual([`${one.foe.id}:2`])
    expect(cells(one.g)).toEqual([])
    const two = board()
    beginAreaReveal(two.g)
    fireVolleyProjectiles(two.g, { player: 0, ox: 0, oy: 1, region: 'surface', dir: 'e', volleys: 2, damage: 1, srcName: 'Test Shot' })
    expect(hits(two.g)).toEqual([])
    expect(cells(two.g)).toEqual(['2,1:1', '2,1:1'])
  })

  it('settling groups hits by source: one targeted hit plus a deathrite elsewhere stay per-minion', () => {
    const { g, foe } = board()
    const other = summonCard(g, 1, 'Escyllion Cyclops', 3, 1)
    beginAreaReveal(g)
    g.flow.dmgTargets = [foe.id]
    recordUnitDamage(g, foe, 3, 'Lightning Bolt')
    recordUnitDamage(g, other, 2, 'Some Deathrite') // set off by the bolt, a different source
    settleUnitDamage(g)
    expect(hits(g)).toEqual([`${foe.id}:3`, `${other.id}:2`])
    expect(cells(g)).toEqual([])
  })

  it('settling: an untargeted spread is an area, but only into a reveal this action opened', () => {
    const { g, foe } = board()
    const other = summonCard(g, 1, 'Escyllion Cyclops', 3, 1)
    beginAreaReveal(g)
    settleUnitDamage(g) // an earlier action settled with that reveal
    recordUnitDamage(g, foe, 1, 'Start Trigger')
    recordUnitDamage(g, other, 1, 'Start Trigger')
    settleUnitDamage(g) // no fresh reveal (a start-of-turn trigger): withdrawn, not pinned to the stale one
    expect(hits(g)).toEqual([])
    expect(cells(g)).toEqual([])
  })

  it('area damage paused on a prompt keeps its area mark (Royal Bodyguard declined)', () => {
    const { g } = board()
    const king = summonCard(g, 1, 'King of the Realm', 2, 1)
    summonCard(g, 1, 'Royal Bodyguard', 2, 1)
    asAreaDamage(g, () => dealDamageToUnit(g, king, 1, 0))
    expect(g.prompts[0]?.kind, 'the Bodyguard offers to take it').toBe('yesNo')
    answer(g, false)
    expect(g.units[king.id].damage).toBe(1)
    expect(hits(g), 'still area damage: no number on the King').toEqual([])
  })

  it('an idle end-of-turn trigger (restoring the older reveal) does not stop the next area from showing', () => {
    const { g, foe } = board()
    const other = summonCard(g, 1, 'Escyllion Cyclops', 3, 1)
    beginAreaReveal(g); settleUnitDamage(g) // an earlier action
    const prev = g.flow.areaReveal
    beginAreaReveal(g); settleUnitDamage(g, 0); g.flow.areaReveal = prev // the idle trigger, as turn.ts does it
    settleUnitDamage(g) // end of that action
    beginAreaReveal(g) // next action: a mass spell
    const src = { player: 0, kind: 'magic', name: 'Rain of Arrows' } as any
    dealDamageToUnit(g, foe, 1, 0, { source: src })
    dealDamageToUnit(g, other, 1, 0, { source: src })
    expect(hits(g)).toEqual([])
    expect(cells(g)).toEqual(['2,1:1', '3,1:1'])
  })

  it('two unrelated hits with no source are never lumped into an area', () => {
    const { g, foe } = board()
    const other = summonCard(g, 1, 'Escyllion Cyclops', 3, 1)
    beginAreaReveal(g)
    dealDamageToUnit(g, foe, 1, 0)
    dealDamageToUnit(g, other, 2, 0)
    expect(hits(g)).toEqual([`${foe.id}:1`, `${other.id}:2`])
  })

  it('a targeted hit redirected to another unit (Bruin) keeps the spell non-area', () => {
    const { g, foe } = board()
    const avatar = g.units[g.players[1].avatarUnitId]
    const bruin = summonCard(g, 1, 'Bruin', avatar.x, avatar.y)
    beginAreaReveal(g)
    g.flow.dmgTargets = [avatar.id, foe.id]
    const src = { player: 0, kind: 'magic', name: 'Two Bolts' } as any
    dealDamageToUnit(g, avatar, 2, 0, { source: src })
    dealDamageToUnit(g, foe, 2, 0, { source: src })
    expect(g.units[bruin.id]?.damage ?? 2, 'Bruin took the blow').toBe(2)
    expect(hits(g)).toEqual([`${bruin.id}:2`, `${foe.id}:2`])
    expect(cells(g)).toEqual([])
  })

  it("a partial settle (an end-of-turn trigger, even from index 0) keeps the action's targets and reveal base", () => {
    const { g, foe } = board()
    beginAreaReveal(g); settleUnitDamage(g)
    const base = g.flow.dmgRevBase
    g.flow.dmgTargets = [foe.id]
    beginAreaReveal(g)
    settleUnitDamage(g, 0)
    expect(g.flow.dmgTargets).toEqual([foe.id])
    expect(g.flow.dmgRevBase).toBe(base)
  })
})
