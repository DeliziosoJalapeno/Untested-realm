// An Enchantress-animated Wildfire keeps its aura effect AS A MINION: at end of turn it deals
// its own 3 damage to units at its location — INCLUDING ITSELF — then, if it survives, the fire
// still spreads and the creature travels WITH it. If the self-burn is lethal, the creature dies,
// dispelling the aura and filing the shared card to the cemetery.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, answer } from './helpers'
import { getScript, makeCtx, avatarOf, checkStateBased, effDefence, type GameState } from '../src'
import '../src/cards/scripts/index'

function injectWildfire(g: any, x: number, y: number): string {
  const cid = `ac${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Wildfire', owner: 0 }
  const id = `r${g.nextId++}`
  g.auras[id] = { id, cardId: cid, name: 'Wildfire', controller: 0, squares: [{ x, y }], counters: { [`v${x}_${y}`]: 1 }, enteredTurn: 1 }
  return id
}
function animate(g: GameState, auraId: string) {
  const av = avatarOf(g, 0); av.name = 'Enchantress'
  getScript('Enchantress')!.conts!.animate(makeCtx(g, av.id, 0, []), {}, [auraId])
  return Object.values(g.units).find((u: any) => String(u.counters?.animatedAura ?? '') === auraId)!
}

describe('animated Wildfire burns itself and travels with the fire', () => {
  it('deals its own 3 damage to itself, then spreads WITH the creature when it survives', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Spire', 2, 2); placeSite(g, 0, 'Spire', 3, 2) // (3,2) unvisited → spread option
    const auraId = injectWildfire(g, 2, 2)
    const m: any = animate(g, auraId)
    expect(effDefence(g, m), 'survives 3 (life > 3)').toBeGreaterThan(3)

    getScript('Wildfire')!.endOfEveryTurn!(makeCtx(g, auraId, 0, []))
    expect(g.units[m.id]?.damage, 'took its own 3 damage').toBe(3)
    // it survived → a spread prompt; answering moves BOTH the aura and the creature
    expect(g.prompts[0]?.kind).toBe('chooseSquare')
    answer(g, { x: 3, y: 2 })
    expect([g.units[m.id].x, g.units[m.id].y], 'the creature travelled with the fire').toEqual([3, 2])
    expect(g.auras[auraId].squares, 'aura and creature stay in sync').toEqual([{ x: 3, y: 2 }])
  })

  it('a lethal self-burn kills the creature → card to cemetery + aura dispelled', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Spire', 2, 2); placeSite(g, 0, 'Spire', 3, 2)
    const auraId = injectWildfire(g, 2, 2)
    const m: any = animate(g, auraId)
    const cardId = g.auras[auraId].cardId
    m.damage = effDefence(g, m) - 1 // one hit from death, so the 3-damage burn is lethal

    getScript('Wildfire')!.endOfEveryTurn!(makeCtx(g, auraId, 0, []))
    checkStateBased(g)
    expect(g.units[m.id], 'the animated Wildfire perished in its own fire').toBeUndefined()
    expect(g.auras[auraId], 'its aura is dispelled').toBeUndefined()
    expect(g.players[0].cemetery, 'the shared card went to the cemetery').toContain(cardId)
    expect(g.prompts.length, 'no spread prompt — it is dead').toBe(0)
  })
})
