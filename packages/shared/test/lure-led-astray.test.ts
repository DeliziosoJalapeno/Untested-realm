// Lure and Led Astray make an enemy take a step of its own (Codex, Forced Movement: "Effects that
// require a unit to take a step are not forced movement … an Immobile unit wouldn't move at all").
// Both moved it by force instead: "can't be moved by force" stopped them. Lure offered any enemy minion
// on the board and fizzled on one that wasn't nearby; Led Astray moved every enemy there instead of
// the ones chosen, and its destination prompt offered no squares.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, summonCard, castMagic, castMagicFail, answer, waiveThreshold, act } from './helpers'
import { avatarOf, getScript, makeCtx, type GameState, type PlayerId, type UnitState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame(); keepBoth(g); fillSites(g); waiveThreshold(g, 0)
  return g
}
const at = (u: UnitState) => `${u.x},${u.y}`
const pending = (g: GameState) => g.prompts[0]

describe('Lure: an enemy minion at a site nearby the ally takes a step closer', () => {
  it('steps the minion toward the ally', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Snow Leopard', 0, 2)
    const foe = summonCard(g, 1, 'Wild Boars', 0, 1) // adjacent: its one closer step is onto the ally's square
    castMagic(g, 0, 'Lure', { targets: [ally.id, foe.id] })
    expect(at(foe)).toBe('0,2')
  })

  it('"can\'t be moved by force" doesn\'t stop a lure — the minion takes its own step', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Snow Leopard', 0, 2)
    const foe = summonCard(g, 1, 'Talamh Dreig', 0, 1)
    castMagic(g, 0, 'Lure', { targets: [ally.id, foe.id] })
    expect(at(foe)).toBe('0,2')
  })

  it('an Immobile minion doesn\'t move', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Snow Leopard', 0, 2)
    const foe = summonCard(g, 1, 'Gloam Toads', 0, 1)
    castMagic(g, 0, 'Lure', { targets: [ally.id, foe.id] })
    expect(at(foe)).toBe('0,1')
  })

  it('Old Salt Anchorman keeps a nearby ally from being lured by an enemy spell', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Snow Leopard', 0, 2)
    const foe = summonCard(g, 1, 'Wild Boars', 0, 1)
    summonCard(g, 1, 'Old Salt Anchorman', 1, 0)
    castMagic(g, 0, 'Lure', { targets: [ally.id, foe.id] })
    expect(at(foe)).toBe('0,1')
  })

  it('only a minion nearby the chosen ally can be picked', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Snow Leopard', 0, 3)
    const far = summonCard(g, 1, 'Wild Boars', 4, 0)
    expect(castMagicFail(g, 0, 'Lure', { targets: [ally.id, far.id] })).toMatch(/nearby/)
  })

  it('with two ways closer, the caster chooses', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Snow Leopard', 1, 2)
    const foe = summonCard(g, 1, 'Wild Boars', 0, 1) // diagonal: (1,1) and (0,2) are both closer
    castMagic(g, 0, 'Lure', { targets: [ally.id, foe.id] })
    const p = pending(g)
    expect(p?.player).toBe(0)
    expect((p?.data as { squares: { x: number; y: number }[] }).squares).toHaveLength(2)
    answer(g, { x: 0, y: 2 })
    expect(at(foe)).toBe('0,2')
  })

  it('an Airborne minion may step diagonally', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Snow Leopard', 1, 2)
    const foe = summonCard(g, 1, 'Wyvern', 0, 1)
    castMagic(g, 0, 'Lure', { targets: [ally.id, foe.id] })
    expect(at(foe), 'one diagonal step onto the ally').toBe('1,2')
  })
})

describe('Led Astray: the chosen enemies take a step together to an adjacent location', () => {
  function crowd() {
    const g = board()
    const a = summonCard(g, 1, 'Wild Boars', 1, 1)
    const b = summonCard(g, 1, 'Ogre Goons', 1, 1)
    castMagic(g, 0, 'Led Astray', { targets: ['sq:1,1,surface'] })
    return { g, a, b }
  }

  it('asks which enemies, then where — and moves only those chosen', () => {
    const { g, a, b } = crowd()
    expect(pending(g)?.kind).toBe('chooseTargets')
    answer(g, [a.id])
    const squares = (pending(g)?.data as { squares: { x: number; y: number }[] }).squares
    expect(squares.map((s) => `${s.x},${s.y}`).sort()).toEqual(['0,1', '1,0', '1,2', '2,1'])
    answer(g, { x: 0, y: 1 })
    expect(at(a)).toBe('0,1')
    expect(at(b), 'not chosen').toBe('1,1')
  })

  it('both chosen: they step to the same location', () => {
    const { g, a, b } = crowd()
    answer(g, [a.id, b.id])
    answer(g, { x: 1, y: 2 })
    expect([at(a), at(b)]).toEqual(['1,2', '1,2'])
  })

  it('an Immobile one stays; "can\'t be moved by force" still steps', () => {
    const g = board()
    const toads = summonCard(g, 1, 'Gloam Toads', 1, 1)
    const dreig = summonCard(g, 1, 'Talamh Dreig', 1, 1)
    castMagic(g, 0, 'Led Astray', { targets: ['sq:1,1,surface'] })
    answer(g, [toads.id, dreig.id])
    answer(g, { x: 0, y: 1 })
    expect(at(toads)).toBe('1,1')
    expect(at(dreig)).toBe('0,1')
  })

  it('a void next to them is no location to step to on the surface', () => {
    const g = board()
    for (const s of Object.values(g.sites)) if (s.x === 0 && s.y === 1) delete g.sites[s.id]
    const a = summonCard(g, 1, 'Wild Boars', 1, 1)
    castMagic(g, 0, 'Led Astray', { targets: ['sq:1,1,surface'] })
    answer(g, [a.id])
    const squares = (pending(g)?.data as { squares: { x: number; y: number }[] }).squares
    expect(squares.some((s) => s.x === 0 && s.y === 1)).toBe(false)
  })

  it('an enemy Avatar is an enemy too', () => {
    const g = board()
    const foe = avatarOf(g, 1 as PlayerId)
    castMagic(g, 0, 'Led Astray', { targets: [`sq:${foe.x},${foe.y},surface`] })
    expect((pending(g)?.data as { candidates: string[] }).candidates).toContain(foe.id)
  })
})

describe('the other lures move the enemy as its own step too', () => {
  it('Coy Nixie beckons a minion that "can\'t be moved by force"', () => {
    const g = board()
    const nixie = summonCard(g, 0, 'Coy Nixie', 0, 2)
    const foe = summonCard(g, 1, 'Talamh Dreig', 0, 1)
    act(g, 0, { t: 'activate', sourceId: nixie.id, ability: 'beckon', targets: [foe.id] })
    expect(at(foe)).toBe('0,2')
    expect(foe.tapped).toBe(true)
  })

  it('Screamer makes it step away, force or no force', () => {
    const g = board()
    const screamer = summonCard(g, 0, 'Screamer', 0, 2)
    const foe = summonCard(g, 1, 'Talamh Dreig', 0, 1) // away: (0,0) or (1,1), the Screamer's side picks
    getScript('Screamer')!.genesis!(makeCtx(g, screamer.id, 0, [{ unit: foe.id }]))
    expect(pending(g)?.player).toBe(0)
    answer(g, { x: 0, y: 0 })
    expect(at(foe)).toBe('0,0')
  })

  it('Abaddon Succubus: a lured minion held back by Old Salt Anchorman never arrives — no damage, no heal', () => {
    const g = board()
    const succubus = summonCard(g, 0, 'Abaddon Succubus', 0, 2)
    const foe = summonCard(g, 1, 'Wild Boars', 0, 1)
    summonCard(g, 1, 'Old Salt Anchorman', 1, 0)
    const life = avatarOf(g, 0 as PlayerId).life
    act(g, 0, { t: 'activate', sourceId: succubus.id, ability: 'lure', targets: [foe.id] })
    expect(at(foe)).toBe('0,1')
    expect(foe.damage).toBe(0)
    expect(avatarOf(g, 0 as PlayerId).life).toBe(life)
  })

  it('Abaddon Succubus: one that arrives takes 2 and you heal 2', () => {
    const g = board()
    const succubus = summonCard(g, 0, 'Abaddon Succubus', 0, 2)
    const foe = summonCard(g, 1, 'Ogre Goons', 0, 1)
    avatarOf(g, 0 as PlayerId).life = 15
    act(g, 0, { t: 'activate', sourceId: succubus.id, ability: 'lure', targets: [foe.id] })
    expect(at(foe)).toBe('0,2')
    expect(foe.damage).toBe(2)
    expect(avatarOf(g, 0 as PlayerId).life).toBe(17)
  })
})
