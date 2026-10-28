// Push / pull / drag cards and targeting. Ward breaks only when an enemy spell or ability TARGETS (Codex,
// Ward); a projectile hit, "a unit here" or "the killer" doesn't target, so those
// picks mustn't break a Ward and drop the pick. Where the text does say "target", an enemy's Stealth hides
// the unit (Codex, Stealth) and its Ward breaks instead. Plus the card-specific fixes: Riptide pulls IN
// (never a unit already on the site), Undertow's Genesis isn't optional, Unland Eel triggers only when it
// submerges, Nelly Longarms only submerges a unit that arrived, Grasping Ground reaches artifacts, Sold-out
// Cemetery's controller makes its choices, Pudge Butcher may fight an ally it hooked, Lacuna Entity only
// reaches an adjacent site.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, waiveThreshold, summonCard, placeSite, giveArtifact, castMagic, castMagicFail, answer, act } from './helpers'
import { avatarOf, getScript, makeCtx, validateTarget, type GameState, type UnitState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame(); keepBoth(g); fillSites(g); waiveThreshold(g, 0)
  // keep both avatars in the far corners, out of the lanes the tests use
  avatarOf(g, 0).x = 4; avatarOf(g, 0).y = 0
  avatarOf(g, 1).x = 4; avatarOf(g, 1).y = 3
  return g
}
/** replace the filler site on a square with a real one */
function swapSite(g: GameState, name: string, x: number, y: number) {
  for (const s of Object.values(g.sites)) if (s.x === x && s.y === y) delete g.sites[s.id]
  return placeSite(g, 0, name, x, y)
}
const ready = (u: UnitState) => { u.enteredTurn = -1; u.tapped = false; return u }
const at = (u: UnitState) => `${u.x},${u.y}`
const p0 = (g: GameState) => g.prompts[0]
const cands = (g: GameState) => (p0(g)?.data as { candidates: string[] }).candidates
const cont = (g: GameState, card: string, key: string, srcId: string, c: Record<string, unknown>, choice: unknown) =>
  getScript(card)!.conts![key](makeCtx(g, srcId, 0, []), c, choice)

describe('a projectile hit isn\'t targeting: a Ward doesn\'t break over the pick', () => {
  it('Grapple Shot latches onto a warded enemy and drags the ally there', () => {
    const g = board()
    const ally = ready(summonCard(g, 0, 'Wild Boars', 0, 0))
    const plain = ready(summonCard(g, 1, 'Snow Leopard', 0, 2))
    const warded = ready(summonCard(g, 1, 'Wild Boars', 0, 2)); warded.ward = true
    castMagic(g, 0, 'Grapple Shot', { targets: [ally.id] })
    answer(g, 'n')
    expect(cands(g).sort()).toEqual([plain.id, warded.id].sort())
    answer(g, [warded.id])
    expect(warded.ward, 'the Ward holds').toBe(true)
    expect(at(ally), 'the ally was dragged to it').toBe('0,2')
  })

  it('Pudge Butcher hooks a warded enemy', () => {
    const g = board()
    const pudge = ready(summonCard(g, 0, 'Pudge Butcher', 0, 0))
    ready(summonCard(g, 1, 'Snow Leopard', 0, 2))
    const warded = ready(summonCard(g, 1, 'Wild Boars', 0, 2)); warded.ward = true
    cont(g, 'Pudge Butcher', 'hook', pudge.id, {}, 'n')
    answer(g, [warded.id])
    expect(warded.ward).toBe(true)
    expect(at(warded)).toBe('0,0')
  })

  it('Nelly Longarms grabs a warded enemy', () => {
    const g = board()
    const nelly = ready(summonCard(g, 0, 'Nelly Longarms', 0, 0))
    ready(summonCard(g, 1, 'Snow Leopard', 0, 2))
    const warded = ready(summonCard(g, 1, 'Wild Boars', 0, 2)); warded.ward = true
    cont(g, 'Nelly Longarms', 'grab', nelly.id, {}, 'n')
    answer(g, [warded.id])
    expect(warded.ward).toBe(true)
    expect(at(warded)).toBe('0,0')
  })
})

describe('"a unit here", "the killer" aren\'t targets either', () => {
  it('Wind Sylph pushes a warded enemy here', () => {
    const g = board()
    const sylph = ready(summonCard(g, 0, 'Wind Sylph', 1, 1))
    const warded = ready(summonCard(g, 1, 'Wild Boars', 1, 1)); warded.ward = true
    getScript('Wind Sylph')!.onSpellCast!(makeCtx(g, sylph.id, 0, []), 0, 'Fire Harpoons!', sylph.id)
    answer(g, [warded.id])
    expect(warded.ward).toBe(true)
    expect(p0(g)?.kind, 'asked where to push it').toBe('chooseSquare')
    answer(g, { x: 1, y: 2 })
    expect(at(warded)).toBe('1,2')
  })

  it('Megalurker drags a warded killer', () => {
    const g = board()
    const lurker = ready(summonCard(g, 0, 'Megalurker', 1, 1))
    const killer = ready(summonCard(g, 1, 'Wild Boars', 1, 2)); killer.ward = true
    g.flow = { ...(g.flow ?? {}), diedLastTurn: [{ controller: 0, killerId: killer.id }] }
    getScript('Megalurker')!.genesis!(makeCtx(g, lurker.id, 0, []))
    answer(g, [killer.id])
    expect(killer.ward).toBe(true)
    expect(at(killer)).toBe('1,1')
  })

  it('Riptide pulls in a warded unit (only the site is targeted)', () => {
    const g = board()
    const pond = swapSite(g, 'Pond', 1, 1)
    const warded = ready(summonCard(g, 1, 'Wild Boars', 1, 2)); warded.ward = true
    castMagic(g, 0, 'Riptide', { targets: [pond.id] })
    answer(g, [warded.id])
    expect(warded.ward).toBe(true)
    expect(at(warded)).toBe('1,1')
  })

  it('Unland Eel drags a warded minion under with it', () => {
    const g = board()
    swapSite(g, 'Pond', 1, 1)
    g.activePlayer = 0
    const eel = ready(summonCard(g, 0, 'Unland Eel', 1, 1))
    const warded = ready(summonCard(g, 1, 'Nelly Longarms', 1, 1)); warded.ward = true // Submerge: it survives below
    act(g, 0, { t: 'moveAttack', unitId: eel.id, path: [{ x: 1, y: 1, region: 'underwater' }] })
    answer(g, [warded.id])
    expect(warded.ward).toBe(true)
    expect(warded.region).toBe('underwater')
  })

})

describe('Sold-out Cemetery: its controller makes the choices', () => {
  it('the site\'s controller picks whom to push and which way, not the pushed Undead\'s', () => {
    const g = board()
    g.activePlayer = 0
    const cem = swapSite(g, 'Sold-out Cemetery', 2, 2); cem.controller = 1; cem.owner = 1
    const resident = ready(summonCard(g, 0, 'Crawler', 2, 2))
    const mover = ready(summonCard(g, 0, 'Bone Jumble', 2, 1))
    act(g, 0, { t: 'moveAttack', unitId: mover.id, path: [{ x: 2, y: 2, region: 'surface' }] })
    expect(p0(g)?.player, 'whom').toBe(1)
    answer(g, [resident.id])
    expect(p0(g)?.kind).toBe('chooseSquare')
    expect(p0(g)?.player, 'and which way').toBe(1)
    answer(g, { x: 3, y: 2 })
    expect(at(resident)).toBe('3,2')
  })
})

describe('Riptide pulls a unit IN', () => {
  it('a unit already on the site isn\'t offered', () => {
    const g = board()
    const pond = swapSite(g, 'Pond', 1, 1)
    const there = ready(summonCard(g, 1, 'Snow Leopard', 1, 1))
    const next = ready(summonCard(g, 1, 'Wild Boars', 1, 2))
    castMagic(g, 0, 'Riptide', { targets: [pond.id] })
    expect(cands(g)).toEqual([next.id])
    expect(cands(g)).not.toContain(there.id)
  })
})

describe('Unland Eel triggers when it submerges, not on any underwater entry', () => {
  it('swimming to an adjacent underwater location doesn\'t trigger', () => {
    const g = board()
    swapSite(g, 'Pond', 1, 1); swapSite(g, 'Pond', 1, 2)
    g.activePlayer = 0
    const eel = ready(summonCard(g, 0, 'Unland Eel', 1, 1, 'underwater'))
    ready(summonCard(g, 1, 'Wild Boars', 1, 2))
    act(g, 0, { t: 'moveAttack', unitId: eel.id, path: [{ x: 1, y: 2, region: 'underwater' }] })
    expect(eel.y).toBe(2)
    expect(g.prompts.length, 'no drag offered').toBe(0)
  })
})

describe('Nelly Longarms submerges only a unit that arrived', () => {
  it('a unit that can\'t be moved by force stays put and isn\'t offered the dunk', () => {
    const g = board()
    swapSite(g, 'Pond', 0, 0)
    const nelly = ready(summonCard(g, 0, 'Nelly Longarms', 0, 0))
    const dreig = ready(summonCard(g, 1, 'Talamh Dreig', 0, 2))
    cont(g, 'Nelly Longarms', 'grab', nelly.id, {}, 'n')
    expect(at(dreig)).toBe('0,2')
    expect(g.prompts.length).toBe(0)
    expect(dreig.region).toBe('surface')
  })

  it('a unit dragged onto her water site may be submerged', () => {
    const g = board()
    swapSite(g, 'Pond', 0, 0)
    const nelly = ready(summonCard(g, 0, 'Nelly Longarms', 0, 0))
    const foe = ready(summonCard(g, 1, 'Nelly Longarms', 0, 2))
    cont(g, 'Nelly Longarms', 'grab', nelly.id, {}, 'n')
    expect(at(foe)).toBe('0,0')
    expect(p0(g)?.kind).toBe('yesNo')
    answer(g, true)
    expect(foe.region).toBe('underwater')
  })
})

describe('Pudge Butcher may fight whatever it hooked', () => {
  it('an ally dragged in is offered the fight too', () => {
    const g = board()
    const pudge = ready(summonCard(g, 0, 'Pudge Butcher', 0, 0))
    const ally = ready(summonCard(g, 0, 'Wild Boars', 0, 2))
    cont(g, 'Pudge Butcher', 'hook', pudge.id, {}, 'n')
    expect(at(ally)).toBe('0,0')
    expect(p0(g)?.kind).toBe('yesNo')
    answer(g, true)
    expect(g.units[ally.id], 'Pudge (5) fought the Boars (2)').toBeUndefined()
  })
})

describe('"target" cards: an enemy\'s Stealth hides it, its Ward breaks', () => {
  it('Ormund Harpooneers can\'t pick a Stealthed enemy', () => {
    const g = board()
    swapSite(g, 'Pond', 1, 2)
    const harp = ready(summonCard(g, 0, 'Ormund Harpooneers', 1, 1))
    const hidden = ready(summonCard(g, 1, 'Wild Boars', 1, 2)); hidden.stealth = true
    const seen = ready(summonCard(g, 1, 'Snow Leopard', 1, 2, 'underwater'))
    getScript('Ormund Harpooneers')!.abilities![0].effect(makeCtx(g, harp.id, 0, []))
    expect(cands(g)).toEqual([seen.id])
  })

  it('Undertow can\'t pick a Stealthed enemy, and must pick a unit', () => {
    const g = board()
    const tow = swapSite(g, 'Undertow', 1, 1)
    swapSite(g, 'Pond', 1, 2)
    const hidden = ready(summonCard(g, 1, 'Wild Boars', 1, 2)); hidden.stealth = true
    const seen = ready(summonCard(g, 1, 'Snow Leopard', 1, 1))
    getScript('Undertow')!.genesis!(makeCtx(g, tow.id, 0, []))
    expect(cands(g)).toEqual([seen.id])
    expect((p0(g)?.data as { upTo?: boolean }).upTo, 'the Genesis isn\'t optional').toBe(false)
  })

  it('Grasping Ground can\'t pick a Stealthed enemy, and reaches an artifact above', () => {
    const g = board()
    ready(summonCard(g, 0, 'Cave Trolls', 1, 1, 'underground'))
    const hidden = ready(summonCard(g, 1, 'Wild Boars', 1, 1)); hidden.stealth = true
    const seen = ready(summonCard(g, 1, 'Snow Leopard', 1, 1))
    const holder = summonCard(g, 1, 'Wild Boars', 3, 3)
    const hook = giveArtifact(g, holder, 'Meat Hook')
    holder.carrying = []; hook.carriedBy = null; hook.x = 1; hook.y = 1 // lying on the ground at (1,1)
    castMagic(g, 0, 'Grasping Ground')
    expect(cands(g).sort()).toEqual([seen.id, hook.id].sort())
    answer(g, [hook.id])
    expect(hook.region).toBe('underground')
  })

  // "above or below" reaches the other region: that's why its spec can't be a region-locked `targeted` one
  it('Fire Harpoons! still harpoons a minion below the water and pulls it up', () => {
    const g = board()
    swapSite(g, 'Pond', 4, 1)
    const below = ready(summonCard(g, 1, 'Nelly Longarms', 4, 1, 'underwater'))
    castMagic(g, 0, 'Fire Harpoons!', { targets: [below.id] })
    expect(below.damage).toBe(1)
    expect(at(below), 'pulled to the caster\'s location').toBe('4,0')
    expect(below.region).toBe('surface')
  })

  it('Fire Harpoons! can\'t target a Stealthed enemy', () => {
    const g = board()
    swapSite(g, 'Pond', 4, 1) // next to player 0's avatar at (4,0)
    const hidden = ready(summonCard(g, 1, 'Wild Boars', 4, 1)); hidden.stealth = true
    expect(castMagicFail(g, 0, 'Fire Harpoons!', { targets: [hidden.id] })).toMatch(/legal/)
  })

  it('Fire Harpoons! on a warded enemy: the Ward breaks, it isn\'t pulled, the card is still drawn', () => {
    const g = board()
    swapSite(g, 'Pond', 4, 1)
    const warded = ready(summonCard(g, 1, 'Snow Leopard', 4, 1)); warded.ward = true
    castMagic(g, 0, 'Fire Harpoons!', { targets: [warded.id] })
    expect(warded.ward).toBe(false)
    expect(at(warded)).toBe('4,1')
    expect(warded.damage).toBe(0)
    expect(p0(g)?.kind, 'still draws a card').toBe('drawDeck')
  })
})

describe('Lacuna Entity: target weaker minion from an adjacent site', () => {
  const spec = () => getScript('Lacuna Entity')!.genesisTargets![0]

  it('a minion two squares away isn\'t a legal target', () => {
    const g = board()
    const lac = ready(summonCard(g, 0, 'Lacuna Entity', 1, 1))
    const near = ready(summonCard(g, 1, 'Bone Jumble', 1, 2))
    const far = ready(summonCard(g, 1, 'Bone Jumble', 1, 3))
    expect(validateTarget(g, spec(), { unit: near.id }, lac, 0)).toBeNull()
    expect(validateTarget(g, spec(), { unit: far.id }, lac, 0)).not.toBeNull()
  })

  it('a Stealthed enemy isn\'t a legal target', () => {
    const g = board()
    const lac = ready(summonCard(g, 0, 'Lacuna Entity', 1, 1))
    const hidden = ready(summonCard(g, 1, 'Bone Jumble', 1, 2)); hidden.stealth = true
    expect(validateTarget(g, spec(), { unit: hidden.id }, lac, 0)).not.toBeNull()
  })

  it('a warded enemy: the Ward breaks and it stays put', () => {
    const g = board()
    const lac = ready(summonCard(g, 0, 'Lacuna Entity', 1, 1))
    const warded = ready(summonCard(g, 1, 'Bone Jumble', 1, 2)); warded.ward = true
    getScript('Lacuna Entity')!.genesis!(makeCtx(g, lac.id, 0, [{ unit: warded.id }]))
    expect(warded.ward).toBe(false)
    expect(at(warded)).toBe('1,2')
  })
})
