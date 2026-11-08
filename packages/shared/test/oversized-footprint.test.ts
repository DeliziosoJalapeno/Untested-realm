// Oversized (2x2) footprints — one rule for every oversized minion, animated auras included:
//  • a square of void is a void location: an oversized minion left there is banished (Cloud City FAQ:
//    "If an oversized minion is now occupying the void, it will be banished"), unless it has Voidwalk;
//  • one straddling an edge that's no longer connected falls to the closest legal position, its
//    controller's choice if tied; with none anywhere it dies (Mountain Giant / Enchantress FAQ).
// And Thunderstorm's drift: the storm's anchor moves with it, and an animated storm moves its body.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, injectToHand, act, answer, waiveThreshold, settlePrompts } from './helpers'
import { checkStateBased, makeCtx, getScript, type GameState, type UnitState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame() as GameState
  keepBoth(g)
  fillSites(g)
  return g
}

function giant(g: GameState, x: number, y: number, name = 'Mountain Giant'): UnitState {
  const cardId = `cg${g.nextId++}`
  g.cards[cardId] = { id: cardId, name, owner: 0 } as any
  const u = {
    id: `ug${g.nextId++}`, cardId, name, owner: 0, controller: 0, isAvatar: false,
    x, y, region: 'surface', size: '2x2', tapped: false, damage: 0, enteredTurn: 0,
    modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  } as unknown as UnitState
  g.units[u.id] = u
  return u
}

const dropSite = (g: GameState, x: number, y: number) => {
  for (const s of Object.values(g.sites)) if (s.x === x && s.y === y) delete g.sites[s.id]
}

/** a Thunderstorm aura with its 2x2 anchor at (ax, ay) */
function storm(g: GameState, player: 0 | 1, ax: number, ay: number): string {
  const cardId = `cts${g.nextId++}`
  g.cards[cardId] = { id: cardId, name: 'Thunderstorm', owner: player }
  g.auras.ts = {
    id: 'ts', cardId, name: 'Thunderstorm', controller: player,
    squares: [{ x: ax, y: ay }, { x: ax + 1, y: ay }, { x: ax, y: ay + 1 }, { x: ax + 1, y: ay + 1 }],
    anchor: { x: ax, y: ay }, counters: { turns: 3 },
  } as any
  return cardId
}

/** the active player becomes the Enchantress and casts a spell, animating the storm */
function animateStorm(g: GameState): UnitState | undefined {
  const p = g.activePlayer
  const av = g.units[g.players[p].avatarUnitId]
  av.name = 'Enchantress'
  waiveThreshold(g, p)
  g.players[p].mana += 20
  const spell = injectToHand(g, p, 'Bone Jumble')
  act(g, p, { t: 'castSpell', cardId: spell, casterId: av.id, at: { x: av.x, y: av.y } })
  answer(g, ['ts'])
  settlePrompts(g)
  return Object.values(g.units).find((u) => u.name === 'Thunderstorm')
}

describe('oversized footprint over the void', () => {
  it('a minion left over a square of void is banished (Cloud City FAQ)', () => {
    const g = board()
    const u = giant(g, 1, 1)
    checkStateBased(g)
    expect(g.units[u.id]).toBeDefined()
    dropSite(g, 2, 2)
    checkStateBased(g)
    expect(g.units[u.id]).toBeUndefined()
    expect(g.players[0].banished).toContain(u.cardId)
  })

  it('with no legal position anywhere after falling off an edge, it dies', () => {
    const g = board()
    for (let x = 0; x < 5; x++) for (let y = 1; y < 3; y++) if (x !== 4) dropSite(g, x, y)
    const u = giant(g, 4, 0) // straddling the east edge (no Globe): squares x=4 and x=5
    checkStateBased(g)
    expect(g.units[u.id]).toBeUndefined()
    expect(g.players[0].cemetery).toContain(u.cardId)
  })
})

describe('Thunderstorm and the Enchantress', () => {
  it('an animated storm over solid ground lives', () => {
    const g = board()
    storm(g, g.activePlayer as 0 | 1, 1, 1)
    const body = animateStorm(g)
    expect(body).toBeDefined()
    expect([body!.x, body!.y]).toEqual([1, 1])
  })

  it('the storm drifts with its anchor, so the Enchantress animates it where it now is', () => {
    const g = board()
    const p = g.activePlayer as 0 | 1
    storm(g, p, 1, 1)
    dropSite(g, 1, 1) // its OLD spot has void under it; the drifted spot is solid
    // drift east through the storm's own drift continuation (its end-of-turn "move one step")
    getScript('Thunderstorm')!.conts!.drift(makeCtx(g, 'ts', p, []), {}, 'east')
    expect(g.auras.ts.anchor, 'the anchor moved with the storm').toEqual({ x: 2, y: 1 })
    const body = animateStorm(g)
    expect(body, 'it was animated over solid ground — it lives').toBeDefined()
    expect([body!.x, body!.y]).toEqual([2, 1])
  })

  it('an animated storm that drifts moves its body, and its aura follows', () => {
    const g = board()
    const p = g.activePlayer as 0 | 1
    storm(g, p, 1, 1)
    const body = animateStorm(g)!
    getScript('Thunderstorm')!.conts!.drift(makeCtx(g, 'ts', p, []), {}, 'east')
    expect([body.x, body.y]).toEqual([2, 1])
    expect(g.auras.ts.anchor).toEqual({ x: 2, y: 1 })
    expect(g.auras.ts.squares).toEqual(expect.arrayContaining([{ x: 3, y: 2 }]))
  })

  it('animated over the void it is banished, taking the aura with it', () => {
    const g = board()
    const cardId = storm(g, g.activePlayer as 0 | 1, 1, 1)
    dropSite(g, 2, 2)
    const body = animateStorm(g)
    expect(body).toBeUndefined()
    expect(g.auras.ts).toBeUndefined()
    expect(g.players[g.activePlayer].banished).toContain(cardId)
  })
})
