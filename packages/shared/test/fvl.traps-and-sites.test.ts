// Frost Mage vs Lavamancer (spoiled set): the Trap sites and the other new sites. Rulebook (October 2026,
// Traps): a Trap site is played face down under the matching basic site and treated as that site until it
// is sprung; "Once per game, as an activated ability, you may pay a Trap's cost to flip it faceup … and
// resolve the Trap's effect." Codex: a silenced or disabled trap can't be activated; to reactivate a trap is
// to activate its ability while it's face-up (Trapper's Rest).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer, act, actFail, giveMana, fillSites } from './helpers'
import { enterSite, siteAt, isDisabled, viewFor, expandActions, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame() as GameState
  keepBoth(g)
  return g
}

/** play `name` face-down at (x,y) through the real site entry, replacing a test site already there */
function playTrap(g: GameState, player: PlayerId, name: string, x: number, y: number): string {
  const old = siteAt(g, x, y)
  if (old) delete g.sites[old.id]
  const cid = `ctrap${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: player }
  return enterSite(g, player, cid, x, y)
}

function spring(g: GameState, player: PlayerId, siteId: string, mana = 10): void {
  giveMana(g, player, mana)
  act(g, player, { t: 'activate', sourceId: siteId, ability: 'trap:spring' })
}

describe('trap sites — face down, once', () => {
  it('a trap is played as its basic site, hidden from the opponent, and can be sprung only once', () => {
    const g = board()
    const id = playTrap(g, 0, 'Sulfur Vents', 2, 1)
    expect(g.sites[id].name).toBe('Wasteland')
    expect(JSON.stringify(viewFor(g, 1)).includes('Sulfur Vents')).toBe(false)
    spring(g, 0, id)
    expect(g.sites[id].name).toBe('Sulfur Vents')
    expect(actFail(g, 0, { t: 'activate', sourceId: id, ability: 'trap:spring' })).toBeTruthy()
  })

  it("a silenced trap can't be sprung", () => {
    const g = board()
    const id = playTrap(g, 0, 'Sulfur Vents', 2, 1)
    giveMana(g, 0, 5)
    g.flow = g.flow ?? {}
    g.flow.siteSilences = [{ siteId: id, x: 2, y: 1, player: 1, turn: g.turn }]
    const err = actFail(g, 0, { t: 'activate', sourceId: id, ability: 'trap:spring' })
    expect(err).toMatch(/silenced/)
  })
})

describe('Spike Trap', () => {
  it('3 damage to a unit here — the springer picks which', () => {
    const g = board()
    const id = playTrap(g, 0, 'Spike Trap', 2, 1)
    const a = summonCard(g, 1, 'Escyllion Cyclops', 2, 1)
    const b = summonCard(g, 1, 'Escyllion Cyclops', 2, 1)
    const mana = g.players[0].mana
    spring(g, 0, id)
    expect(g.players[0].mana, 'Trap (1)').toBe(mana + 10 - 1)
    answer(g, [b.id])
    expect([g.units[a.id].damage, g.units[b.id].damage]).toEqual([0, 3])
  })

  it('with nobody here it can still be sprung (paying the cost is all a spring needs); nothing happens', () => {
    const g = board()
    const id = playTrap(g, 0, 'Spike Trap', 2, 1)
    spring(g, 0, id)
    expect(g.sites[id].name).toBe('Spike Trap')
    expect(g.prompts.length).toBe(0)
  })
})

describe('Sulfur Vents', () => {
  it('1 damage to each adjacent minion, above and below', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Sulfur Vents', 2, 1)
    const here = summonCard(g, 1, 'Cave Trolls', 2, 1)
    const under = summonCard(g, 1, 'Cave Trolls', 2, 2, 'underground')
    const diag = summonCard(g, 1, 'Cave Trolls', 3, 2)
    spring(g, 0, id)
    expect([g.units[here.id].damage, g.units[under.id].damage, g.units[diag.id].damage]).toEqual([1, 1, 0])
    expect(g.units[g.players[0].avatarUnitId].damage ?? 0, 'not the Avatar (not a minion)').toBe(0)
  })
})

describe('Supervolcano', () => {
  it('needs (F)(F)(F); all minions on the surface take 20', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Supervolcano', 2, 1)
    const top = summonCard(g, 1, 'Escyllion Cyclops', 4, 3)
    const mine = summonCard(g, 0, 'Escyllion Cyclops', 0, 0)
    const under = summonCard(g, 1, 'Cave Trolls', 1, 1, 'underground')
    giveMana(g, 0, 10)
    expect(actFail(g, 0, { t: 'activate', sourceId: id, ability: 'trap:spring' })).toMatch(/threshold/)
    for (const x of [0, 1]) playTrap(g, 0, 'Wasteland', x, 3) // two more fire sites → (F)(F)(F) with the trap's disguise
    spring(g, 0, id, 0)
    expect(g.units[top.id]).toBeUndefined()
    expect(g.units[mine.id]).toBeUndefined()
    expect(g.units[under.id]).toBeDefined()
  })
})

describe('Icicle Dome', () => {
  it('destroys a target adjacent disabled or immobile minion', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Icicle Dome', 2, 1)
    const frozen = summonCard(g, 1, 'Cave Trolls', 2, 2)
    frozen.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: g.turn, sourcePlayer: 0 })
    const awake = summonCard(g, 1, 'Cave Trolls', 3, 1)
    spring(g, 0, id)
    const p: any = g.prompts[0]
    expect(p.data.candidates).toEqual([frozen.id])
    answer(g, [frozen.id])
    expect(g.units[frozen.id]).toBeUndefined()
    expect(g.units[awake.id]).toBeDefined()
  })
})

describe('Deep Snow', () => {
  it('taps the minions at a target adjacent site; they skip their next untap', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Deep Snow', 2, 1)
    const foe = summonCard(g, 1, 'Cave Trolls', 2, 2)
    spring(g, 0, id)
    answer(g, [siteAt(g, 2, 2)!.id])
    expect(foe.tapped).toBe(true)
    expect(foe.counters?.skipUntap).toBe(1)
  })
})

describe('Combusting Busts', () => {
  it('3 damage to each unit at another adjacent location', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Combusting Busts', 2, 1)
    const a = summonCard(g, 1, 'Escyllion Cyclops', 3, 1)
    const b = summonCard(g, 1, 'Escyllion Cyclops', 3, 1)
    const here = summonCard(g, 1, 'Escyllion Cyclops', 2, 1)
    const mana = g.players[0].mana
    spring(g, 0, id)
    expect((g.prompts[0] as any).data.squares).not.toContainEqual({ x: 2, y: 1 })
    answer(g, { x: 3, y: 1 })
    expect([g.units[a.id].damage, g.units[b.id].damage, g.units[here.id].damage]).toEqual([3, 3, 0])
    expect(g.players[0].mana, 'Trap (4)').toBe(mana + 10 - 4)
  })
})

describe('Volcanic Eruption', () => {
  it('three 1-damage projectiles, one in each direction but the spared one', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Volcanic Eruption', 2, 1)
    const n = summonCard(g, 1, 'Cave Trolls', 2, 2)
    const e = summonCard(g, 1, 'Cave Trolls', 4, 1)
    const w = summonCard(g, 1, 'Cave Trolls', 0, 1)
    spring(g, 0, id)
    answer(g, 'spare the west')
    expect([g.units[n.id].damage, g.units[e.id].damage, g.units[w.id].damage]).toEqual([1, 1, 0])
  })

  it('a shot that must ask which unit it hits pauses the eruption; the other shots follow the answer', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Volcanic Eruption', 1, 1)
    const n = summonCard(g, 1, 'Cave Trolls', 1, 2)
    const n2 = summonCard(g, 1, 'Cave Trolls', 1, 2) // two units where the north shot lands: it asks
    const e = summonCard(g, 1, 'Cave Trolls', 3, 1)
    const s = summonCard(g, 1, 'Cave Trolls', 1, 0)
    spring(g, 0, id)
    answer(g, 'spare the west')
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    expect(g.units[e.id].damage, 'later shots wait for the answer').toBe(0)
    answer(g, [n2.id])
    expect([g.units[n.id].damage, g.units[n2.id].damage, g.units[e.id].damage, g.units[s.id].damage]).toEqual([0, 1, 1, 1])
  })
})

describe('Springstem Meadow', () => {
  it('flings a unit atop it onto a nearby site', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Springstem Meadow', 2, 1)
    const foe = summonCard(g, 1, 'Cave Trolls', 2, 1)
    spring(g, 0, id)
    answer(g, { x: 3, y: 2 })
    expect([foe.x, foe.y]).toEqual([3, 2])
  })
})

describe('Avalanche', () => {
  it('snow flows forward from the trap, carrying the surface units along and disabling them', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Avalanche', 1, 0)
    const a = summonCard(g, 1, 'Cave Trolls', 1, 0)
    const b = summonCard(g, 1, 'Cave Trolls', 1, 2)
    const side = summonCard(g, 1, 'Cave Trolls', 2, 2)
    spring(g, 0, id)
    for (const u of [a, b]) {
      expect([u.x, u.y], `${u.id} carried to the far edge`).toEqual([1, 3])
      expect(isDisabled(g, u)).toBe(true)
    }
    expect(isDisabled(g, side)).toBe(false)
  })
})

describe('Bouldermaw', () => {
  it('rolls the Rolling Boulder from your collection out of here', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Bouldermaw', 2, 0)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
    giveMana(g, 0, 10)
    g.players[0].collection = { ...(g.players[0].collection ?? {}), 'Rolling Boulder': 1 }
    act(g, 0, { t: 'activate', sourceId: id, ability: 'trap:spring' })
    answer(g, 'n')
    expect(g.units[foe.id].damage).toBe(4)
    expect(g.players[0].collection!['Rolling Boulder']).toBe(0)
    const boulder = Object.values(g.artifacts).find((a) => a.name === 'Rolling Boulder')!
    expect([boulder.x, boulder.y]).toEqual([2, 3])
  })
})

describe("Trapper's Rest", () => {
  it('Genesis → you may reactivate an adjacent face-up trap for (1) less', () => {
    const g = board()
    fillSites(g)
    const vents = playTrap(g, 0, 'Sulfur Vents', 2, 1)
    const foe = summonCard(g, 1, 'Cave Trolls', 2, 2)
    spring(g, 0, vents, 1)
    expect(g.units[foe.id].damage).toBe(1)
    g.players[0].mana = 0 // reactivating the 1-cost Vents costs (0)
    playTrap(g, 0, "Trapper's Rest", 2, 0)
    const p: any = g.prompts[0]
    expect(p.data.candidates).toEqual([vents])
    answer(g, [vents])
    expect(g.units[foe.id].damage).toBe(2)
  })
})

describe('the computer opponent and traps', () => {
  it('springing its own face-down trap is one of the moves it considers', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Sulfur Vents', 2, 1)
    summonCard(g, 1, 'Cave Trolls', 2, 1)
    giveMana(g, 0, 5)
    const moves = expandActions(g, 0).map((m) => m.action)
    expect(moves).toContainEqual({ t: 'activate', sourceId: id, ability: 'trap:spring' })
  })
})

describe('Smoldering Hollow / Scoria / Tundra are plain sites, not traps', () => {
  it('they enter face up', () => {
    const g = board()
    for (const [name, x] of [['Smoldering Hollow', 0], ['Scoria', 1], ['Tundra', 2], ["Trapper's Rest", 3]] as const) {
      const id = playTrap(g, 0, name, x, 3)
      expect(g.sites[id].name).toBe(name)
      expect(g.sites[id].trap).toBeUndefined()
    }
  })
})

describe('review follow-ups (traps)', () => {
  it('Combusting Busts can blast the location beneath itself, but never its own surface', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Combusting Busts', 2, 1)
    const under = summonCard(g, 1, 'Cave Trolls', 2, 1, 'underground')
    const top = summonCard(g, 1, 'Cave Trolls', 2, 1)
    spring(g, 0, id)
    expect((g.prompts[0] as any).data.squares).toContainEqual({ x: 2, y: 1 })
    answer(g, { x: 2, y: 1 })
    expect(g.units[under.id], '3 damage below').toBeUndefined()
    expect(g.units[top.id].damage).toBe(0)
  })

  it("a sprung trap's damage is credited to the trap, not its disguise", () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Sulfur Vents', 2, 1)
    summonCard(g, 1, 'Cave Trolls', 2, 1)
    const before = g.log.length
    spring(g, 0, id)
    const logs = g.log.slice(before).map((l: any) => l.text ?? l.msg ?? JSON.stringify(l)).join('\n')
    expect(logs).not.toMatch(/Wasteland/)
  })
})
