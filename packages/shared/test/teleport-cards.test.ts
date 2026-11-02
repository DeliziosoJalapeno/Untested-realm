// Teleport and relocation cards. Codex (Teleport): "Teleportation is forced movement directly from one
// location to another. Teleportation does not cross borders." (Nearby): a nearby LOCATION keeps to its
// region. (Void): a square without a site has no surface or subsurface. A follow-up that needs the unit
// to get there (strike it, burrow it, tap everyone there) only happens if it arrived.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, waiveThreshold, summonCard, castMagic, castMagicFail, answer, act, placeSite, giveArtifact } from './helpers'
import { getScript, makeCtx, type GameState, type PlayerId, type UnitState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame(); keepBoth(g); fillSites(g); waiveThreshold(g, 0)
  return g
}
const at = (u: { x: number; y: number }) => `${u.x},${u.y}`
const pending = (g: GameState) => g.prompts[0]
const squaresOf = (g: GameState) => ((pending(g)?.data as { squares?: { x: number; y: number }[] } | undefined)?.squares ?? []).map(at).sort()
function clearSite(g: GameState, x: number, y: number): void {
  for (const s of Object.values(g.sites)) if (s.x === x && s.y === y) delete g.sites[s.id]
}
function swapSite(g: GameState, owner: PlayerId, name: string, x: number, y: number) {
  clearSite(g, x, y)
  return placeSite(g, owner, name, x, y)
}
const ready = (u: UnitState) => { u.enteredTurn = -1; return u }
/** resolve Displace on a unit straight from its script, past cast-time targeting */
const displace = (g: GameState, unitId: string) =>
  getScript('Displace')!.onCast!(makeCtx(g, g.players[0].avatarUnitId, 0, [{ unit: unitId }], undefined, undefined, { kind: 'magic', name: 'Displace' }))

describe('Flanking Maneuver: "any number of allies" — the caster picks which go', () => {
  it('asks which allies, and only the chosen one flanks', () => {
    const g = board()
    const a = summonCard(g, 0, 'Wild Boars', 1, 1)
    const b = summonCard(g, 0, 'Snow Leopard', 1, 1)
    castMagic(g, 0, 'Flanking Maneuver', { targets: ['sq:1,1,surface', 'sq:3,2,surface'] })
    expect(pending(g)?.kind).toBe('chooseTargets')
    answer(g, [a.id])
    expect(at(a)).toBe('3,2')
    expect(at(b), 'not chosen').toBe('1,1')
  })

  it('a lone ally flanks without a question', () => {
    const g = board()
    const a = summonCard(g, 0, 'Wild Boars', 1, 1)
    castMagic(g, 0, 'Flanking Maneuver', { targets: ['sq:1,1,surface', 'sq:3,2,surface'] })
    expect(g.prompts.some((p) => p.kind === 'chooseTargets')).toBe(false)
    expect(at(a)).toBe('3,2')
  })
})

describe('Clamor of Harpies: the weaker minion must come, and is struck only if it arrives', () => {
  it('no strike when Old Salt Anchorman keeps the minion from being teleported', () => {
    const g = board()
    const boars = summonCard(g, 1, 'Wild Boars', 0, 1)
    summonCard(g, 1, 'Old Salt Anchorman', 1, 1)
    castMagic(g, 0, 'Clamor of Harpies', { at: { x: 3, y: 2 }, targets: [boars.id] })
    expect(at(boars)).toBe('0,1')
    expect(g.prompts.length, 'no "strike it?" for a minion that never came').toBe(0)
  })

  it('a cast that skipped the target is asked for one once the Harpies land', () => {
    const g = board()
    const boars = summonCard(g, 1, 'Wild Boars', 0, 1)
    castMagic(g, 0, 'Clamor of Harpies', { at: { x: 3, y: 2 } })
    const p = pending(g)
    expect(p?.kind).toBe('chooseTargets')
    expect((p?.data as { upTo?: boolean; candidates: string[] }).upTo).toBe(false)
    expect((p?.data as { candidates: string[] }).candidates).toContain(boars.id)
    answer(g, [boars.id])
    expect(at(boars)).toBe('3,2')
    expect(pending(g)?.kind, 'then they may strike it').toBe('yesNo')
  })
})

describe('Bitter Departed: teleports to a killer in its own region, without targeting it', () => {
  it('a killer underground is out of reach from the surface', () => {
    const g = board()
    const killer = summonCard(g, 1, 'Cave Trolls', 0, 1, 'underground')
    g.flow.diedLastTurn = [{ controller: 0, killerId: killer.id }]
    castMagic(g, 0, 'Bitter Departed', { at: { x: 3, y: 2 } })
    expect(g.prompts.length).toBe(0)
  })

  it('choosing a warded killer doesn\'t break its Ward: the Departed still go', () => {
    const g = board()
    const killer = summonCard(g, 1, 'Wild Boars', 0, 1)
    killer.ward = true
    g.flow.diedLastTurn = [{ controller: 0, killerId: killer.id }]
    castMagic(g, 0, 'Bitter Departed', { at: { x: 3, y: 2 } })
    answer(g, [killer.id])
    const departed = Object.values(g.units).find((u) => u.name === 'Bitter Departed')!
    expect(at(departed)).toBe('0,1')
  })
})

describe('Draco Corvus: burrows the minion only if it got there, and only by force that can move it', () => {
  it('Gnome Hollows keeps Draco out: the minion isn\'t burrowed', () => {
    const g = board()
    swapSite(g, 1, 'Gnome Hollows', 0, 1)
    const draco = ready(summonCard(g, 0, 'Draco Corvus', 2, 2))
    const foe = summonCard(g, 1, 'Wild Boars', 0, 1); foe.tapped = true
    act(g, 0, { t: 'activate', sourceId: draco.id, ability: 'snatch', targets: [foe.id] })
    expect(at(draco)).toBe('2,2')
    expect(foe.region).toBe('surface')
  })

  it('Talamh Dreig can\'t be moved by force — not even under', () => {
    const g = board()
    const draco = ready(summonCard(g, 0, 'Draco Corvus', 2, 2))
    const foe = summonCard(g, 1, 'Talamh Dreig', 0, 1); foe.tapped = true
    act(g, 0, { t: 'activate', sourceId: draco.id, ability: 'snatch', targets: [foe.id] })
    expect(at(draco)).toBe('0,1')
    expect(foe.region).toBe('surface')
  })
})

describe('Thundering Giant: taps the other units at the location it arrives at', () => {
  it('taps those on the surface there, not those underground', () => {
    const g = board()
    const giant = ready(summonCard(g, 0, 'Thundering Giant', 2, 2))
    const top = summonCard(g, 1, 'Wild Boars', 3, 2)
    const below = summonCard(g, 1, 'Pit Vipers', 3, 2, 'underground')
    act(g, 0, { t: 'activate', sourceId: giant.id, ability: 'thunder' })
    answer(g, { x: 3, y: 2 })
    expect(at(giant)).toBe('3,2')
    expect(top.tapped).toBe(true)
    expect(below.tapped, 'a different location').toBe(false)
  })

  it('taps no one when it can\'t enter the site', () => {
    const g = board()
    swapSite(g, 1, 'Gnome Hollows', 3, 2)
    const giant = ready(summonCard(g, 0, 'Thundering Giant', 2, 2))
    const top = summonCard(g, 1, 'Wild Boars', 3, 2)
    act(g, 0, { t: 'activate', sourceId: giant.id, ability: 'thunder' })
    answer(g, { x: 3, y: 2 })
    expect(at(giant)).toBe('2,2')
    expect(top.tapped).toBe(false)
  })
})

describe('13 Treasures of Britain: slipping to a void lies in the void, not on a surface', () => {
  it('lands in the void region', () => {
    const g = board()
    const bearer = summonCard(g, 0, 'Wild Boars', 2, 2)
    const art = giveArtifact(g, bearer, '13 Treasures of Britain')
    clearSite(g, 4, 0)
    getScript('13 Treasures of Britain')!.conts!.slip(makeCtx(g, art.id, 0, []), { artId: art.id, __opts: [{ x: 4, y: 0 }] }, 0)
    expect(at(g.artifacts[art.id])).toBe('4,0')
    expect(g.artifacts[art.id].region).toBe('void')
  })
})

describe('Displace: one diagonal step in the same region (an aura may reach the void)', () => {
  it('an underground minion isn\'t offered a water site, which has no underground', () => {
    const g = board()
    swapSite(g, 0, 'Spring River', 3, 3)
    const trolls = summonCard(g, 1, 'Cave Trolls', 2, 2, 'underground')
    displace(g, trolls.id) // (a surface caster couldn't target it)
    expect(squaresOf(g)).toEqual(['1,1', '1,3', '3,1'])
    answer(g, { x: 1, y: 1 })
    expect(at(trolls)).toBe('1,1')
    expect(trolls.region).toBe('underground')
  })

  it('a Voidwalker in the void steps to a diagonal void, not onto a site', () => {
    const g = board()
    clearSite(g, 2, 2); clearSite(g, 3, 3)
    const wisps = summonCard(g, 1, "Wills-o'-the-Wisp", 2, 2, 'void')
    displace(g, wisps.id)
    expect(squaresOf(g)).toEqual(['3,3'])
  })

  it('a single-site aura may shift into a diagonal void (FAQ)', () => {
    const g = board()
    clearSite(g, 3, 3)
    const aid = `r${g.nextId++}`
    const cid = `ctest${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Wildfire', owner: 0 }
    ;(g.auras as Record<string, unknown>)[aid] = { id: aid, cardId: cid, name: 'Wildfire', controller: 0, squares: [{ x: 2, y: 2 }], enteredTurn: 0 }
    castMagic(g, 0, 'Displace', { targets: [aid] })
    expect(squaresOf(g)).toContain('3,3')
    answer(g, { x: 3, y: 3 })
    expect(g.auras[aid].squares).toEqual([{ x: 3, y: 3 }])
  })

  it('choosing an enemy\'s warded site as the destination doesn\'t break its Ward', () => {
    const g = board()
    const dest = swapSite(g, 1, 'Spire', 3, 3)
    dest.ward = true
    const ally = summonCard(g, 0, 'Wild Boars', 2, 2)
    castMagic(g, 0, 'Displace', { targets: [ally.id] })
    answer(g, { x: 3, y: 3 })
    expect(at(ally)).toBe('3,3')
    expect(dest.ward).toBe(true)
  })
})

describe("Wills-o'-the-Wisp: evade to a nearby location in their region or a void — or stand", () => {
  it('from the void, only other voids are offered, and they may stand', () => {
    const g = board()
    clearSite(g, 0, 0); clearSite(g, 1, 0)
    const wisps = summonCard(g, 0, "Wills-o'-the-Wisp", 0, 0, 'void')
    const foe = summonCard(g, 1, 'Wild Boars', 0, 1)
    getScript("Wills-o'-the-Wisp")!.onUnitAttacked!(makeCtx(g, wisps.id, 0, []), wisps, foe)
    expect(squaresOf(g)).toEqual(['1,0'])
    answer(g, null)
    expect(at(wisps)).toBe('0,0')
  })

  it('underground they stay underground on a site', () => {
    const g = board()
    const wisps = summonCard(g, 0, "Wills-o'-the-Wisp", 2, 2, 'underground')
    getScript("Wills-o'-the-Wisp")!.conts!.flicker(makeCtx(g, wisps.id, 0, []), {}, { x: 3, y: 2 })
    expect(at(wisps)).toBe('3,2')
    expect(wisps.region).toBe('underground')
  })
})

describe('Blink: a location the ally is nearby, in its own region', () => {
  it('a surface ally can\'t Blink into a void', () => {
    const g = board()
    clearSite(g, 3, 2)
    const ally = summonCard(g, 0, 'Wild Boars', 2, 2)
    expect(castMagicFail(g, 0, 'Blink', { targets: [ally.id, 'sq:3,2'] })).toBeTruthy()
    expect(castMagicFail(g, 0, 'Blink', { targets: [ally.id, 'sq:3,2,surface'] })).toBeTruthy()
  })

  it('a Voidwalker in the void Blinks to another void, not onto a site', () => {
    const g = board()
    clearSite(g, 2, 2); clearSite(g, 3, 2)
    const wisps = summonCard(g, 0, "Wills-o'-the-Wisp", 2, 2, 'void')
    expect(castMagicFail(g, 0, 'Blink', { targets: [wisps.id, 'sq:1,2'] })).toBeTruthy()
    castMagic(g, 0, 'Blink', { targets: [wisps.id, 'sq:3,2'] })
    expect(at(wisps)).toBe('3,2')
    expect(wisps.region).toBe('void')
  })
})
