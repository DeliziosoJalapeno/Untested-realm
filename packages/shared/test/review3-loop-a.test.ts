// Third comparison list (THEIR_ISSUES_REPRO_LOOP.md #1–#12): carried artifacts act at their bearer's
// location, threshold-gated City drawbacks, ranged strikes are strikes, projectiles stop at the void,
// silence strips "can't move to defend" and Waterbound, forced submerge fails on land.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, castMagic, waiveThreshold, act, actFail, settlePrompts } from './helpers'
import { checkStateBased, isDisabled, sourceMana, summonToken, avatarOf, type GameState } from '../src'
import { reachableLocations } from '../src/engine/movement'
import '../src/cards/scripts/index'

function game(): GameState {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  for (const s of Object.values(g.sites)) delete g.sites[s.id]
  return g
}
const shoot = (g: GameState, id: string, direction: string) =>
  act(g, 0, { t: 'activate', sourceId: id, ability: 'ranged', extra: { direction } })

describe('#1 a carried Scarecrow stops Airborne minions at its bearer\'s location', () => {
  function board(carried: boolean) {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 1, 1); placeSite(g, 1, 'Rustic Village', 1, 2)
    const mal = summonCard(g, 0, 'Malakhim', 1, 1)
    const sm = summonCard(g, 1, 'Shield Maidens', 1, 2)
    if (carried) giveArtifact(g, sm, 'Scarecrow')
    return { g, mal, sm }
  }
  const reaches = (g: GameState, id: string) => reachableLocations(g, g.units[id]).some((s) => s.x === 1 && s.y === 2)
  it('no move and no attack onto the bearer\'s square', () => {
    const { g, mal, sm } = board(true)
    expect(reaches(g, mal.id), 'the square is not offered').toBe(false)
    act(g, 0, { t: 'moveAttack', unitId: mal.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: sm.id } })
    settlePrompts(g)
    expect([g.units[mal.id].x, g.units[mal.id].y], 'the step in is refused').toEqual([1, 1])
    expect(g.units[sm.id].damage).toBe(0)
  })
  it('control: without the Scarecrow the square is reachable', () => {
    const { g, mal } = board(false)
    expect(reaches(g, mal.id)).toBe(true)
  })
  it('an Airborne bearer still moves with its own Scarecrow', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 1, 1); placeSite(g, 0, 'Rustic Village', 1, 2)
    const mal = summonCard(g, 0, 'Malakhim', 1, 1)
    giveArtifact(g, mal, 'Scarecrow')
    act(g, 0, { t: 'moveAttack', unitId: mal.id, path: [{ x: 1, y: 2, region: 'surface' }] })
    expect(g.units[mal.id].y).toBe(2)
  })
})

describe('#2 a City\'s drawback needs its threshold', () => {
  function glass(airSite: boolean) {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 1, 1)
    const city = placeSite(g, 1, 'City of Glass', 1, 2)
    placeSite(g, 1, airSite ? 'Wuthering Heights' : 'Deep Sea', 3, 2)
    const knight = summonCard(g, 0, 'Penitent Knight', 1, 1)
    act(g, 0, { t: 'moveAttack', unitId: knight.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { site: city.id } })
    settlePrompts(g)
    return { g, city }
  }
  it('City of Glass without Air threshold takes the strike and stays', () => {
    const { g, city } = glass(false)
    expect(g.sites[city.id]?.isRubble).toBe(false)
  })
  it('control: with Air threshold it shatters', () => {
    const { g, city } = glass(true)
    expect(Object.values(g.sites).some((s) => s.x === 1 && s.y === 2 && s.name === 'City of Glass' && !s.isRubble)).toBe(false)
  })
  it('City of Plenty without Water threshold gives neither the extra (1) nor the opponent\'s (1)', () => {
    const g = game()
    placeSite(g, 0, 'City of Plenty', 1, 1); placeSite(g, 0, 'Valley', 1, 2)
    for (let x = 0; x < 4; x++) placeSite(g, 1, 'Valley', x, 3)
    expect(sourceMana(g, 0), 'no Water: the City provides only (1)').toBe(2)
    act(g, 0, { t: 'endTurn' }); settlePrompts(g)
    expect(g.players[1].mana, 'the opponent gets only their four sites').toBe(4)
  })
  it('control: with Water threshold the City provides (2) and the opponent gets (1)', () => {
    const g = game()
    placeSite(g, 0, 'City of Plenty', 1, 1); placeSite(g, 0, 'Stream', 1, 2)
    for (let x = 0; x < 4; x++) placeSite(g, 1, 'Valley', x, 3)
    expect(sourceMana(g, 0)).toBe(3)
    act(g, 0, { t: 'endTurn' }); settlePrompts(g)
    expect(g.players[1].mana).toBe(5)
  })
})

describe('#3 a disabled Order of the White Wing banishes nothing', () => {
  it('a Root Spider below it lets a Skeleton token be summoned next to it', () => {
    const g = game()
    placeSite(g, 1, 'Rustic Village', 3, 1); placeSite(g, 1, 'Rustic Village', 3, 2)
    const ww = summonCard(g, 1, 'Order of the White Wing', 3, 1)
    summonCard(g, 0, 'Root Spider', 3, 1, 'underground')
    expect(isDisabled(g, ww)).toBe(true)
    expect(summonToken(g, 'Skeleton', 0, 3, 2), 'the Skeleton stays').not.toBeNull()
  })
  it('control: an active White Wing banishes it', () => {
    const g = game()
    placeSite(g, 1, 'Rustic Village', 3, 1); placeSite(g, 1, 'Rustic Village', 3, 2)
    summonCard(g, 1, 'Order of the White Wing', 3, 1)
    expect(summonToken(g, 'Skeleton', 0, 3, 2)).toBeNull()
  })
})

describe('#4 a Faerie carrying a Cold Iron Rod is disabled', () => {
  it('Pookas holding the Rod can neither move nor attack', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 1, 1); placeSite(g, 1, 'Rustic Village', 1, 2)
    const pookas = summonCard(g, 0, 'Pookas', 1, 1)
    const fox = summonCard(g, 1, 'Sly Fox', 1, 2)
    giveArtifact(g, pookas, 'Cold Iron Rod')
    checkStateBased(g)
    expect(isDisabled(g, pookas)).toBe(true)
    actFail(g, 0, { t: 'moveAttack', unitId: pookas.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: fox.id } })
  })
})

describe('#5 a forced submerge fails on a land site (Trial by Water)', () => {
  function board(victimOnWater: boolean) {
    const g = game()
    placeSite(g, 0, 'Deep Sea', 1, 1); placeSite(g, 1, victimOnWater ? 'Deep Sea' : 'Ghost Town', 1, 2)
    const wendigo = summonCard(g, 0, 'Gnarled Wendigo', 1, 1)
    const troll = summonCard(g, 1, 'Bosk Troll', 1, 2)
    castMagic(g, 0, 'Trial by Water', { targets: [wendigo.id, troll.id] })
    settlePrompts(g)
    return { g, troll }
  }
  it('the Troll on land stays on the surface, unharmed', () => {
    const { g, troll } = board(false)
    expect(g.units[troll.id]?.region).toBe('surface')
  })
  it('control: on water it drowns', () => {
    const { g, troll } = board(true)
    expect(g.units[troll.id]).toBeUndefined()
  })
})

describe('ranged strikes are strikes (#6 Lance, #7 Blood Ravens, #9 Phantasmal Shade)', () => {
  it('#6 a Lance adds +1 to a ranged strike and breaks', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 1, 1); placeSite(g, 1, 'Rustic Village', 1, 2)
    const sk = summonCard(g, 0, 'Skirmishers of Mu', 1, 1)
    const lance = giveArtifact(g, sk, 'Lance')
    const wk = summonCard(g, 1, 'White Knight', 1, 2)
    shoot(g, sk.id, 'n')
    expect(g.units[wk.id].damage, '3 + 1 from the Lance').toBe(4)
    expect(g.artifacts[lance.id], 'the Lance broke').toBeUndefined()
  })
  it('#7 Blood Ravens\' ranged strike heals you', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 1, 1); placeSite(g, 1, 'Rustic Village', 1, 2)
    avatarOf(g, 0).life = 16
    const br = summonCard(g, 0, 'Blood Ravens', 1, 1)
    giveArtifact(g, br, 'Truesight Crossbow')
    const wk = summonCard(g, 1, 'White Knight', 1, 2)
    shoot(g, br.id, 'n')
    expect(g.units[wk.id].damage).toBe(1)
    expect(avatarOf(g, 0).life).toBe(17)
  })
  it('#9 a ranged strike destroys Phantasmal Shade', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 1, 1); placeSite(g, 1, 'Rustic Village', 1, 2)
    const rogue = summonCard(g, 0, 'Midnight Rogue', 1, 1)
    const shade = summonCard(g, 1, 'Phantasmal Shade', 1, 2)
    shoot(g, rogue.id, 'n')
    expect(g.units[shade.id]).toBeUndefined()
  })
})

describe('#8 a Ranged shot stops at a void square', () => {
  function board(gap: boolean) {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 0, 0); placeSite(g, 1, 'Rustic Village', 0, 2)
    if (!gap) placeSite(g, 0, 'Rustic Village', 0, 1)
    const wolves = summonCard(g, 0, 'Grey Wolves', 0, 0)
    giveArtifact(g, wolves, 'Fail-not Bow')
    const bears = summonCard(g, 1, 'Polar Bears', 0, 2)
    shoot(g, wolves.id, 'n')
    return { g, bears }
  }
  it('no hit across the void', () => {
    const { g, bears } = board(true)
    expect(g.units[bears.id].damage).toBe(0)
  })
  it('control: with a site between, the Bears are hit', () => {
    const { g, bears } = board(false)
    expect(g.units[bears.id]?.damage ?? 99).toBeGreaterThan(0)
  })
})

describe('#10 a silenced Skeleton may move to defend', () => {
  function board(silencer: boolean) {
    const g = game()
    for (const [x, y] of [[1, 1], [1, 2], [1, 3], [2, 2], [4, 0]]) placeSite(g, 0, 'Rustic Village', x, y)
    const mn = summonCard(g, 0, 'Mother Nature', 1, 1)
    const tapped = summonCard(g, 1, 'Skeleton', 1, 2); tapped.tapped = true
    const guard = summonCard(g, 1, 'Skeleton', 1, 3)
    if (silencer) summonCard(g, 0, 'Sisters of Silence', 2, 2)
    checkStateBased(g)
    act(g, 0, { t: 'moveAttack', unitId: mn.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: tapped.id } })
    const defend = g.prompts.find((p) => p.kind === 'defend')
    return ((defend?.data?.candidates ?? []) as string[]).includes(guard.id)
  }
  it('silenced: offered as a defender', () => expect(board(true)).toBe(true))
  it('control: not silenced, not offered', () => expect(board(false)).toBe(false))
})

describe('#11 a silenced Waterbound minion off water is not disabled', () => {
  it('Pirate Ship next to Sister Stefánia strikes back on land', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 1, 1); placeSite(g, 1, 'Valley', 1, 2); placeSite(g, 1, 'Valley', 1, 3)
    const ship = summonCard(g, 1, 'Pirate Ship', 1, 2)
    summonCard(g, 1, 'Sister Stefánia', 1, 3)
    const att = summonCard(g, 0, 'Bosk Troll', 1, 1)
    checkStateBased(g)
    expect(ship.silenced).toBe(true)
    expect(isDisabled(g, ship)).toBe(false)
    act(g, 0, { t: 'moveAttack', unitId: att.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: ship.id } })
    settlePrompts(g)
    expect(g.units[att.id], 'the Ship struck back for 5').toBeUndefined()
  })
})

describe('#12/#13 a carried Blightstone disables the site under its bearer', () => {
  it('#12 moving onto a Blessed Village strips its Ward', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 1, 1)
    const village = placeSite(g, 1, 'Blessed Village', 1, 2); village.ward = true
    const sk = summonCard(g, 0, 'Skeleton', 1, 1)
    giveArtifact(g, sk, 'Blightstone')
    act(g, 0, { t: 'moveAttack', unitId: sk.id, path: [{ x: 1, y: 2, region: 'surface' }] })
    settlePrompts(g)
    expect(g.sites[village.id].ward).toBeFalsy()
  })
  it('#13 the Stream under a Ghoul with a Blightstone gives no mana', () => {
    const g = game()
    placeSite(g, 1, 'Valley', 1, 2); placeSite(g, 1, 'Stream', 1, 3)
    expect(sourceMana(g, 1)).toBe(2)
    const ghoul = summonCard(g, 0, 'Ghoul', 1, 3)
    giveArtifact(g, ghoul, 'Blightstone')
    expect(sourceMana(g, 1)).toBe(1)
  })
})
