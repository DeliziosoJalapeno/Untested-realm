import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { getScript, makeCtx, avatarOf, isSummoningSick, occupiedSquares, checkStateBased, killUnit, type GameState } from '../src'

type AuraOpts = { squares: { x: number; y: number }[]; anchor?: { x: number; y: number }; edge?: any; enteredTurn: number }
function injectAura(g: GameState, name: string, o: AuraOpts): string {
  const cardId = `ac${g.nextId++}`
  ;(g.cards as any)[cardId] = { id: cardId, name, owner: 0 }
  const id = `r${g.nextId++}`
  ;(g.auras as any)[id] = { id, cardId, name, controller: 0, squares: o.squares, anchor: o.anchor, edge: o.edge, enteredTurn: o.enteredTurn }
  return id
}
function animate(g: GameState, auraId: string, _name: string) {
  const avatar = avatarOf(g, 0); avatar.name = 'Enchantress'
  // the animate cont now takes the chosen aura id directly (board chooseTargets kind:'aura')
  getScript('Enchantress')!.conts!.animate(makeCtx(g, avatar.id, 0, []), {}, [auraId])
  return Object.values(g.units).find((u) => String(u.counters?.animatedAura ?? '') === auraId)!
}

describe('Enchantress — aura minion summoning sickness follows the AURA cast turn', () => {
  it('an aura cast on a PREVIOUS turn animates WITHOUT summoning sickness', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    const r = injectAura(g, 'Eclipse', { squares: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }], anchor: { x: 1, y: 1 }, enteredTurn: 3 })
    const u = animate(g, r, 'Eclipse')
    expect(isSummoningSick(g, u)).toBe(false)
  })
  it('an aura cast THIS turn animates summoning-sick', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    const r = injectAura(g, 'Eclipse', { squares: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }], anchor: { x: 1, y: 1 }, enteredTurn: 5 })
    const u = animate(g, r, 'Eclipse')
    expect(isSummoningSick(g, u)).toBe(true)
  })
})

describe('Enchantress — the aura minion footprint mirrors the aura area', () => {
  it('a 2x2 aura → a 2x2 (oversized) minion', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    const r = injectAura(g, 'Eclipse', { squares: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }], anchor: { x: 1, y: 1 }, enteredTurn: 3 })
    const u = animate(g, r, 'Eclipse')
    expect(u.size).toBe('2x2')
    expect(occupiedSquares(u).length).toBe(4)
  })
  it('a single-site aura → a plain 1x1 minion', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    const r = injectAura(g, 'Wildfire', { squares: [{ x: 2, y: 2 }], enteredTurn: 3 })
    const u = animate(g, r, 'Wildfire')
    expect(u.size).toBeUndefined()
    expect(u.extraSquares).toBeUndefined()
    expect(occupiedSquares(u)).toEqual([{ x: 2, y: 2 }])
  })
  it('a border/wall aura → a 2x1 (or 1x2) minion spanning both bordered squares', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    const r = injectAura(g, 'Wall of Fire', { squares: [{ x: 1, y: 1 }], edge: { a: { x: 1, y: 1 }, b: { x: 2, y: 1 } }, enteredTurn: 3 })
    const u = animate(g, r, 'Wall of Fire')
    expect(u.size).toBeUndefined()
    const occ = occupiedSquares(u)
    expect(occ.length).toBe(2)
    expect(occ).toEqual(expect.arrayContaining([{ x: 1, y: 1 }, { x: 2, y: 1 }]))
  })
})

describe('Enchantress — an aura minion dies over a void, sending its aura to the cemetery', () => {
  it('when a square it occupies becomes void, it DIES and its aura card goes to the cemetery', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    const site = placeSite(g, 0, 'Spire', 2, 2)
    const r = injectAura(g, 'Wildfire', { squares: [{ x: 2, y: 2 }], enteredTurn: 3 })
    const u = animate(g, r, 'Wildfire')
    const auraCard = g.auras[r].cardId
    expect(g.units[u.id]).toBeTruthy()

    delete (g.sites as any)[site.id] // the site vanishes → the square is now void
    checkStateBased(g)

    expect(g.units[u.id], 'the aura minion died').toBeUndefined()
    expect(g.auras[r], 'the aura is gone from the realm').toBeUndefined()
    expect(g.players[0].cemetery, 'its card went to the cemetery').toContain(auraCard)
    expect(g.players[0].banished).not.toContain(auraCard) // NOT banished
  })

  it('when the aura minion is killed (combat), the aura card goes to the cemetery too', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Spire', 2, 2)
    const r = injectAura(g, 'Wildfire', { squares: [{ x: 2, y: 2 }], enteredTurn: 3 })
    const u = animate(g, r, 'Wildfire')
    const auraCard = g.auras[r].cardId

    killUnit(g, u.id)

    expect(g.units[u.id]).toBeUndefined()
    expect(g.auras[r]).toBeUndefined()
    expect(g.players[0].cemetery).toContain(auraCard)
  })
})

describe('Enchantress — an aura minion taken off the SURFACE dies (aura → cemetery)', () => {
  // A surface aura cannot exist underground/underwater, so burrowing, submerging or
  // being flooded under kills the animated creature (the site stays; only its region left).
  for (const region of ['underground', 'underwater'] as const) {
    it(`region '${region}' (burrowed / submerged) kills the aura minion`, () => {
      const g = newGame(); keepBoth(g); g.turn = 5
      placeSite(g, 0, 'Spire', 2, 2) // the square keeps its site — only the region changes
      const r = injectAura(g, 'Wildfire', { squares: [{ x: 2, y: 2 }], enteredTurn: 3 })
      const u = animate(g, r, 'Wildfire')
      const auraCard = g.auras[r].cardId
      expect(g.units[u.id]).toBeTruthy()

      g.units[u.id].region = region // e.g. Burrowing underground / Submerge / flood underwater
      checkStateBased(g)

      expect(g.units[u.id], 'off-surface aura minion perishes').toBeUndefined()
      expect(g.auras[r], 'its aura leaves the realm').toBeUndefined()
      expect(g.players[0].cemetery, 'card filed to the cemetery').toContain(auraCard)
      expect(g.players[0].banished).not.toContain(auraCard)
    })
  }

  it('a 2x2 aura minion also dies if taken underground', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) placeSite(g, 0, 'Spire', x, y)
    const r = injectAura(g, 'Eclipse', { squares: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }], anchor: { x: 1, y: 1 }, enteredTurn: 3 })
    const u = animate(g, r, 'Eclipse')
    g.units[u.id].region = 'underground'
    checkStateBased(g)
    expect(g.units[u.id]).toBeUndefined()
    expect(g.auras[r]).toBeUndefined()
  })

  it('control: a normal surface aura minion survives checkStateBased', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Spire', 2, 2)
    const r = injectAura(g, 'Wildfire', { squares: [{ x: 2, y: 2 }], enteredTurn: 3 })
    const u = animate(g, r, 'Wildfire')
    checkStateBased(g)
    expect(g.units[u.id], 'still alive on the surface').toBeTruthy()
    expect(g.auras[r]).toBeTruthy()
  })
})
