import { describe, it, expect } from 'vitest'
import { builtinScenarios, normalizeIds, board, viewFor, applyAction } from '../src'

describe('builtin scenarios (DOM fixtures as public defaults)', () => {
  it('ships the three sandbox fixtures with stable ids', () => {
    const list = builtinScenarios()
    expect(list.map((s) => s.id)).toEqual(['builtin:board', 'builtin:triggers', 'builtin:abilities'])
    for (const s of list) expect(s.name.length).toBeGreaterThan(0)
  })

  it('every built-in is fully id-normalized (no fake fz ids) with resolvable references', () => {
    for (const { state: g } of builtinScenarios()) {
      const allIds = [
        ...Object.keys(g.units), ...Object.keys(g.sites),
        ...Object.keys(g.artifacts), ...Object.keys(g.cards),
      ]
      expect(allIds.some((id) => id.startsWith('fz')), 'no fake fz-prefixed ids remain').toBe(false)
      // avatars resolve
      for (const p of g.players) expect(g.units[p.avatarUnitId], 'avatar unit resolves').toBeTruthy()
      // every unit / site points at a real card record
      for (const u of Object.values(g.units)) expect(g.cards[u.cardId], `${u.name} card resolves`).toBeTruthy()
      for (const s of Object.values(g.sites)) expect(g.cards[s.cardId], `${s.name} card resolves`).toBeTruthy()
      // hand card ids resolve
      for (const p of g.players) for (const cid of p.hand) expect(g.cards[cid]).toBeTruthy()
      // the snapshot is viewable from both seats
      expect(() => viewFor(g, 0)).not.toThrow()
      expect(() => viewFor(g, 1)).not.toThrow()
    }
  })

  it('normalized non-avatar units carry engine-valid `u`-prefixed ids (so they are targetable)', () => {
    const g = builtinScenarios()[0].state
    const minions = Object.values(g.units).filter((u) => !u.isAvatar)
    expect(minions.length).toBeGreaterThan(0)
    for (const u of minions) expect(u.id.startsWith('u'), `${u.id} is a valid unit ref`).toBe(true)
    for (const s of Object.values(g.sites)) expect(s.id.startsWith('s'), `${s.id} is a valid site ref`).toBe(true)
  })

  it('a normalized board still accepts engine actions (endTurn) — proof it is playable', () => {
    const g = normalizeIds(board())
    const before = g.turn
    const r = applyAction(g, g.activePlayer, { t: 'endTurn' })
    expect(r.ok, r.error ?? '').toBe(true)
    expect(g.turn).toBeGreaterThanOrEqual(before)
  })
})
