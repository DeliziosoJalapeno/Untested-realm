// Secret-achievement detection: the pure applyAchievements pass diffs prev→next and records unlocks
// on next.flow.achievements (once per game, attributed to a seat). viewFor redacts the other seat's.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { applyAchievements, applyJudge, viewFor, type GameState } from '../src'

const clone = (g: GameState): GameState => JSON.parse(JSON.stringify(g))
const unlocked = (g: GameState) => (g.flow?.achievements ?? []) as { id: string; seat: number }[]
const has = (g: GameState, id: string, seat: number) => unlocked(g).some((u) => u.id === id && u.seat === seat)

describe('achievement detection', () => {
  it('horse-tower: a unit carrying a unit carrying a unit', () => {
    const g = newGame(); keepBoth(g)
    for (let i = 0; i < 3; i++) applyJudge(g, 0, { k: 'token', name: 'Skeleton', player: 0, x: 0, y: 0, region: 'surface' })
    const ids = Object.values(g.units).filter((u) => u.name === 'Skeleton').map((u) => u.id)
    expect(ids.length).toBe(3)
    const prev = clone(g)
    g.units[ids[0]].carryingUnits = [ids[1]]
    g.units[ids[1]].carryingUnits = [ids[2]]
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    expect(has(g, 'horse-tower', 0)).toBe(true)
  })

  it("who's the avatar now?: a minion with >20 power", () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'token', name: 'Skeleton', player: 0, x: 1, y: 1, region: 'surface' })
    const sk = Object.values(g.units).find((u) => u.name === 'Skeleton')!
    const prev = clone(g)
    applyJudge(g, 0, { k: 'power', unitId: sk.id, amount: 25, duration: 'permanent' })
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    expect(has(g, 'whos-avatar-now', 0)).toBe(true)
  })

  it('sotother / roll-sanity fire for the summoner and the observer respectively', () => {
    const g = newGame(); keepBoth(g)
    const prev = clone(g)
    applyJudge(g, 0, { k: 'summonUnit', name: 'Yog-Sothoth', player: 0, x: 2, y: 2, region: 'surface', noGenesis: true })
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    expect(has(g, 'sotother', 0)).toBe(true)   // the summoner
    expect(has(g, 'roll-sanity', 1)).toBe(true) // the horrified observer
  })

  it('records each unlock only once per game', () => {
    const g = newGame(); keepBoth(g)
    const prev = clone(g)
    applyJudge(g, 0, { k: 'summonUnit', name: 'Yog-Sothoth', player: 0, x: 2, y: 2, region: 'surface', noGenesis: true })
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    applyAchievements(prev, g, 0, { t: 'endTurn' }) // re-run: no duplicates
    expect(unlocked(g).filter((u) => u.id === 'sotother').length).toBe(1)
  })

  it('viewFor redacts the other seat unlocks (no mid-game info leak)', () => {
    const g = newGame(); keepBoth(g)
    const prev = clone(g)
    applyJudge(g, 0, { k: 'summonUnit', name: 'Yog-Sothoth', player: 0, x: 2, y: 2, region: 'surface', noGenesis: true })
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    const seat0 = viewFor(g, 0).flow?.achievements as { id: string }[]
    const seat1 = viewFor(g, 1).flow?.achievements as { id: string }[]
    expect(seat0.some((u) => u.id === 'sotother')).toBe(true)     // summoner sees their own
    expect(seat1.some((u) => u.id === 'sotother')).toBe(false)    // opponent never sees it
    expect(seat1.some((u) => u.id === 'roll-sanity')).toBe(true)  // but sees their own observer unlock
    // internal per-turn scratch never leaves the server
    expect((viewFor(g, 0).flow as any)?.achvScratch).toBeUndefined()
  })
})
