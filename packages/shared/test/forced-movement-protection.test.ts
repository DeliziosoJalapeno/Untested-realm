// "Can't be moved by force" (Talamh Dreig, Iron Man Talus) stops every forced movement — teleport, push,
// pull, drag, being carried (Codex, Forced Movement) — not only enemy ones. Old Salt Anchorman's "can't be
// moved by enemy spells and abilities" is the enemy-only one. Being forced under water is a move too.
// A carried unit is moved by force: it can't be carried where it can't enter (it stays behind, dropped),
// and a Voidwalk carrier takes it into the void (Codex, Carrying Units: Phantom Steed and Bosk Troll).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, summonCard, placeSite, act, actFail, castMagic, waiveThreshold } from './helpers'
import { makeCtx, trySubmerge, type GameState, type UnitState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame(); keepBoth(g); fillSites(g)
  return g
}
const at = (u: UnitState) => `${u.x},${u.y}`
const ready = (u: UnitState) => { u.enteredTurn = -1; u.tapped = false; return u }

describe('"can\'t be moved by force" stops its own controller\'s effects too', () => {
  it('its controller can\'t teleport Talamh Dreig, and the move reports it never left', () => {
    const g = board()
    const dreig = summonCard(g, 0, 'Talamh Dreig', 1, 1)
    expect(makeCtx(g, '', 0, []).teleport(dreig.id, 3, 1, 'surface')).toBe(false)
    expect(at(dreig)).toBe('1,1')
  })

  it('nor push it', () => {
    const g = board()
    const dreig = summonCard(g, 0, 'Talamh Dreig', 1, 1)
    expect(makeCtx(g, '', 0, []).teleport(dreig.id, 2, 1, 'surface', { push: true })).toBe(false)
    expect(at(dreig)).toBe('1,1')
  })

  it('an Anchorman only stops the enemy: its own side still moves the ally, and the move says so', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Wild Boars', 1, 1)
    summonCard(g, 0, 'Old Salt Anchorman', 1, 2)
    expect(makeCtx(g, '', 1, []).teleport(ally.id, 3, 1, 'surface'), 'the enemy can\'t').toBe(false)
    expect(at(ally)).toBe('1,1')
    expect(makeCtx(g, '', 0, []).teleport(ally.id, 3, 1, 'surface'), 'its own side can').toBe(true)
    expect(at(ally)).toBe('3,1')
  })
})

describe('being forced under water is forced movement', () => {
  it('Talamh Dreig isn\'t submerged, by either side', () => {
    const g = board()
    placeSite(g, 0, 'Pond', 1, 1)
    const dreig = summonCard(g, 0, 'Talamh Dreig', 1, 1)
    expect(trySubmerge(g, dreig, 0)).toBe(false)
    expect(trySubmerge(g, dreig, 1)).toBe(false)
    expect(dreig.region).toBe('surface')
  })

  it('an Anchorman keeps its allies from being dragged under by the enemy', () => {
    const g = board()
    placeSite(g, 0, 'Pond', 1, 1)
    const ally = summonCard(g, 0, 'Wild Boars', 1, 1)
    summonCard(g, 0, 'Old Salt Anchorman', 1, 2)
    expect(trySubmerge(g, ally, 1)).toBe(false)
    expect(ally.region).toBe('surface')
  })

  it('Drown can\'t submerge Talamh Dreig, even its own controller\'s', () => {
    const g = board(); waiveThreshold(g, 0)
    placeSite(g, 0, 'Pond', 1, 1)
    const dreig = summonCard(g, 0, 'Talamh Dreig', 1, 1)
    castMagic(g, 0, 'Drown', { targets: [dreig.id] })
    expect(dreig.region).toBe('surface')
  })

  it('a minion locked in the Cage of Sidrak isn\'t dragged under', () => {
    const g = board()
    placeSite(g, 0, 'Pond', 1, 1)
    const u = summonCard(g, 1, 'Wild Boars', 1, 1)
    g.flow = { ...(g.flow ?? {}), cagedUnits: [{ unitId: u.id }] }
    expect(trySubmerge(g, u, 0)).toBe(false)
    expect(u.region).toBe('surface')
  })
})

describe('carried units are moved by force', () => {
  it('a unit that can\'t be moved by force can\'t be picked up', () => {
    const g = board()
    const horse = ready(summonCard(g, 0, 'War Horse', 1, 1))
    const dreig = summonCard(g, 0, 'Talamh Dreig', 1, 1)
    expect(actFail(g, 0, { t: 'pickUp', unitId: horse.id, artifactIds: [], unitIds: [dreig.id] })).toMatch(/moved by force/)
  })

  it('a War Horse rides into Gnome Hollows, but the Bosk Troll it carries can\'t enter: it stays behind, dropped', () => {
    const g = board()
    placeSite(g, 0, 'Gnome Hollows', 2, 1)
    const horse = ready(summonCard(g, 0, 'War Horse', 1, 1))
    const troll = summonCard(g, 0, 'Bosk Troll', 1, 1)
    horse.carryingUnits = [troll.id]; troll.carriedBy = horse.id
    act(g, 0, { t: 'moveAttack', unitId: horse.id, path: [{ x: 2, y: 1, region: 'surface' }] })
    expect(at(horse)).toBe('2,1')
    expect(at(troll), 'the Troll stays where it was').toBe('1,1')
    expect(troll.carriedBy, 'and is dropped').toBeNull()
  })

  it('a Phantom Steed carries a Bosk Troll into the void, and the Troll survives there while carried', () => {
    const g = board()
    for (const s of Object.values(g.sites)) if (s.x === 2 && s.y === 1) delete g.sites[s.id]
    const steed = ready(summonCard(g, 0, 'Phantom Steed', 1, 1))
    const troll = summonCard(g, 0, 'Bosk Troll', 1, 1)
    steed.carryingUnits = [troll.id]; troll.carriedBy = steed.id
    act(g, 0, { t: 'moveAttack', unitId: steed.id, path: [{ x: 2, y: 1, region: 'void' }] })
    expect(at(steed)).toBe('2,1')
    const t = g.units[troll.id]
    expect(t, 'the Troll was not banished').toBeTruthy()
    expect(t && `${at(t)} ${t.region}`).toBe('2,1 void')
    expect(t?.carriedBy).toBe(steed.id)
  })
})
