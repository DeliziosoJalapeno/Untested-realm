import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, waiveThreshold, answer } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'

// ── Plague of Frogs ────────────────────────────────────────────────────────────
// Most recent FAQ: all seven frog tokens land on a SINGLE location of your choice
// (the swarm lands together), not spread one-by-one across the board.
describe('Plague of Frogs summons the whole swarm to one location', () => {
  it('one chooseSquare prompt → seven Frog tokens at that square (all surface)', () => {
    const g = newGame(); keepBoth(g)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Plague of Frogs')
    // exactly one placement prompt, then the whole swarm resolves at once
    expect(g.prompts[0]?.kind).toBe('chooseSquare')
    answer(g, { x: 2, y: 2 })
    expect(g.prompts.length, 'no further per-frog prompts').toBe(0)

    const frogs = Object.values(g.units).filter((u) => u.name === 'Frog')
    expect(frogs.length).toBe(7)
    for (const f of frogs) {
      expect(f.x).toBe(2)
      expect(f.y).toBe(2)
      expect(f.region).toBe('surface')
    }
  })
})

// ── The Black Plague / The Great Famine ─────────────────────────────────────────
// The aura afflicts each affected SITE, so a minion burrowed or submerged on that
// site is on the site and can succumb — not only surface minions.
function injectPlague(g: GameState, name: string, x: number, y: number, controller: 0 | 1 = 0): string {
  const cardId = `ac${g.nextId++}`
  ;(g.cards as any)[cardId] = { id: cardId, name, owner: controller }
  const id = `r${g.nextId++}`
  ;(g.auras as any)[id] = { id, cardId, name, controller, squares: [{ x, y }], enteredTurn: 0 }
  return id
}
function runEndOfTurn(g: GameState, auraId: string, controller: 0 | 1 = 0): void {
  getScript(g.auras[auraId].name)!.endOfTurn!(makeCtx(g, auraId, controller, []))
}

describe('The Black Plague reaches minions burrowed/submerged on an affected site', () => {
  it('a submerged minion on the affected site succumbs', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Spire', 2, 2)
    const drowned = summonCard(g, 1, 'Bone Jumble', 2, 2, 'underwater')
    const r = injectPlague(g, 'The Black Plague', 2, 2)
    runEndOfTurn(g, r)
    expect(g.units[drowned.id], 'the submerged minion on the site died').toBeUndefined()
    expect(g.auras[r], 'the aura survives (something died)').toBeTruthy()
  })

  it('a burrowed minion on the affected site succumbs too', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Spire', 1, 1)
    const buried = summonCard(g, 1, 'Bone Jumble', 1, 1, 'underground')
    const r = injectPlague(g, 'The Black Plague', 1, 1)
    runEndOfTurn(g, r)
    expect(g.units[buried.id]).toBeUndefined()
  })

  it('with nothing anywhere on the affected sites the aura still dispels', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Spire', 3, 2)
    const r = injectPlague(g, 'The Black Plague', 3, 2)
    runEndOfTurn(g, r)
    expect(g.auras[r], 'dispelled when nothing dies').toBeFalsy()
  })
})
