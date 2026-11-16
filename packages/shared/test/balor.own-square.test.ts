import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'

// Owner ruling: Balor's "each other location" includes the OTHER location of its own square —
// beneath its site, or above it in the rare case Balor is itself subsurface.
function gaze(g: any, balorId: string, dir: string) {
  act(g, 0, { t: 'activate', sourceId: balorId, ability: 'gaze' })
  answer(g, dir)
  let guard = 0
  while (g.prompts.length && guard++ < 8) {
    const p: any = g.prompts[0]
    answer(g, p.kind === 'chooseTargets' ? [p.data.candidates[0]] : null)
  }
}

describe('Balor of the Evil Eye gazes its own square\'s other location', () => {
  it('hits a unit beneath its own site, whatever direction it looks', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 0, 1)
    const balor = summonCard(g, 0, 'Balor of the Evil Eye', 0, 1)
    balor.enteredTurn = -1
    const buried = summonCard(g, 1, 'Cave Trolls', 0, 1)
    buried.region = 'underground'
    const besideOnSurface = summonCard(g, 1, 'Escyllion Cyclops', 0, 1) // Balor's own location: untouched
    gaze(g, balor.id, 'e')
    expect(g.units[buried.id]?.damage, 'the unit beneath Balor\'s site is gazed').toBe(2)
    expect(g.units[besideOnSurface.id]?.damage ?? 0, 'Balor\'s own location is not an "other" one').toBe(0)
    expect(g.units[balor.id]?.damage ?? 0).toBe(0)
  })

  it('a subsurface Balor gazes the surface above it', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 0, 1)
    const balor = summonCard(g, 0, 'Balor of the Evil Eye', 0, 1)
    balor.enteredTurn = -1; balor.region = 'underground'
    balor.modifiers.push({ kind: 'keyword', keyword: 'burrowing', duration: 'permanent', turn: g.turn, sourcePlayer: 0 }) // e.g. Kingdom of Agartha
    const above = summonCard(g, 1, 'Escyllion Cyclops', 0, 1)
    gaze(g, balor.id, 'n')
    expect(g.units[above.id]?.damage, 'the surface unit above is gazed').toBe(2)
  })

  it('several units beneath → Balor\'s controller picks one', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 0, 1)
    const balor = summonCard(g, 0, 'Balor of the Evil Eye', 0, 1)
    balor.enteredTurn = -1
    const a = summonCard(g, 1, 'Cave Trolls', 0, 1); a.region = 'underground'
    const b = summonCard(g, 1, 'Cave Trolls', 0, 1); b.region = 'underground'
    act(g, 0, { t: 'activate', sourceId: balor.id, ability: 'gaze' })
    answer(g, 'e')
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect([...p.data.candidates].sort()).toEqual([a.id, b.id].sort())
    answer(g, [b.id])
    expect(g.units[b.id]?.damage).toBe(2)
    expect(g.units[a.id]?.damage ?? 0).toBe(0)
  })
})
