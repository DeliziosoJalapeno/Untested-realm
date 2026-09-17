// Hillock Basilisk (and Stone-Gaze Gorgons) disable minions "at rest" here / one step in front. Two
// rulings:
//  1. The disable only bites a unit that is "at rest" — never while it is ACTING (its own move/attack),
//     still ENTERING, or PARTAKING IN A BATTLE. Only once a unit comes to REST disabled does it lose its
//     abilities like any disabled unit: Ward and Stealth are abilities, and those marks are persistent
//     (they don't come back), so a unit at rest in a Basilisk's cone loses its Ward/Stealth. A unit that
//     is fighting is NOT disabled, so it KEEPS its ward for that fight (the Basilisk either disables or
//     it doesn't). See ward-disabled.test.ts.
//  2. A minion still ENTERING isn't "at rest" until its Genesis — including any prompt — fully
//     resolves, so an Archangel Michael cast in front of a Basilisk can take its step + strike (and
//     keep its Ward) before it ever comes to rest.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, giveMana, waiveThreshold, placeSite, summonCard, castMagic, answer } from './helpers'
import { isDisabled, checkStateBased, type GameState } from '../src'
import '../src/cards/scripts/index'

// a Basilisk controlled by player 1 at (2,3): its FRONT (controller 1 → y−1) is (2,2); (2,3) is "here"
function withBasilisk(): { g: GameState; basId: string } {
  const g = newGame() as GameState; keepBoth(g)
  placeSite(g, 0, 'Rustic Village', 2, 2)
  placeSite(g, 1, 'Rustic Village', 2, 3)
  const bas = summonCard(g, 1, 'Hillock Basilisk', 2, 3); bas.enteredTurn = -1
  return { g, basId: bas.id }
}

describe('at-rest disable keeps ward/stealth, and lets an entering minion act', () => {
  it('a minion sitting AT REST in front of a Basilisk is disabled, but NOT while it acts', () => {
    const { g } = withBasilisk()
    const mike = summonCard(g, 0, 'Archangel Michael', 2, 2); mike.enteredTurn = -1
    checkStateBased(g)
    expect(isDisabled(g, mike), 'disabled while it sits at rest').toBe(true)
    // when it acts, it isn't at rest → not disabled at all
    ;(g.flow as any).actingUnitId = mike.id
    expect(isDisabled(g, mike), 'never disabled while acting').toBe(false)
  })

  it('a unit still ENTERING is exempt from the at-rest disable until it settles', () => {
    const { g } = withBasilisk()
    const mike = summonCard(g, 0, 'Archangel Michael', 2, 2); mike.enteredTurn = -1
    ;(g.flow as any).entering = [mike.id]
    expect(isDisabled(g, mike), 'exempt while entering (Genesis in progress)').toBe(false)
    ;(g.flow as any).entering = []
    expect(isDisabled(g, mike), 'disabled once it comes to rest').toBe(true)
  })

  it('Archangel Michael cast in front of a Basilisk takes its step + strikes, keeping its ward', () => {
    const { g, basId } = withBasilisk()
    giveMana(g, 0, 30); waiveThreshold(g, 0)
    castMagic(g, 0, 'Archangel Michael', { at: { x: 2, y: 2 } })
    const mike = Object.values(g.units).find((u) => u.name === 'Archangel Michael')!
    // Genesis is asking which site to step to — Michael is ENTERING, so not disabled, ward intact
    expect((g.flow as any).entering?.includes(mike.id), 'entering during its Genesis prompt').toBe(true)
    expect(isDisabled(g, mike), 'not disabled mid-Genesis').toBe(false)
    expect(mike.ward, 'ward intact mid-Genesis').toBe(true)
    // step onto the Basilisk's own site (2,3) and strike it
    const cands: string[] = g.prompts[0].data.candidates
    const onto = cands.find((id) => g.sites[id]?.x === 2 && g.sites[id]?.y === 3)!
    expect(onto, 'can step onto the Basilisk’s square').toBeTruthy()
    answer(g, onto)
    // drain any strike-order prompt
    while (g.prompts.length) answer(g, g.prompts[0].data?.candidates?.[0] ?? g.prompts[0].data?.order ?? [])
    expect(mike.x === 2 && mike.y === 3, 'Michael took his step onto the Basilisk').toBe(true)
    expect(mike.ward, 'Michael kept his ward — never at rest during his own action').toBe(true)
    // the Basilisk was struck (dead, or damaged)
    const bas = g.units[basId]
    expect(!bas || (bas.damage ?? 0) > 0, 'the Basilisk was struck').toBe(true)
  })
})
