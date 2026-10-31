// The Black Plague / The Great Famine: "the weakest/strongest minion occupying affected sites dies …
// Dispel if none die." Dying is a destruction, so a ward breaks instead (any source, the plague's own
// controller's minions too) — and then no one died, so the plague is dispelled.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, answer } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

function injectPlague(g: GameState, name: string, x: number, y: number): string {
  const cardId = `ac${g.nextId++}`
  ;(g.cards as any)[cardId] = { id: cardId, name, owner: 0 }
  const id = `r${g.nextId++}`
  ;(g.auras as any)[id] = { id, cardId, name, controller: 0, squares: [{ x, y }], enteredTurn: 0 }
  return id
}
const endOfTurn = (g: GameState, auraId: string) => getScript(g.auras[auraId].name)!.endOfTurn!(makeCtx(g, auraId, 0, []))
const dispelled = (g: GameState, auraId: string, cardId: string) => !g.auras[auraId] && g.players[0].cemetery.includes(cardId)

describe('a plague breaks a ward instead of killing, and is then dispelled', () => {
  it("The Black Plague: a lone warded enemy survives, loses its ward, and the plague passes on", () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const victim = summonCard(g, 1, 'Stygian Archers', 2, 2); victim.ward = true
    const r = injectPlague(g, 'The Black Plague', 2, 2)
    const cardId = g.auras[r].cardId
    endOfTurn(g, r)
    expect(g.units[victim.id], 'the ward saved it').toBeTruthy()
    expect(g.units[victim.id].ward, 'the ward broke').toBeFalsy()
    expect(dispelled(g, r, cardId), 'none died: dispelled').toBe(true)
  })

  it("The Great Famine: the controller's own warded minion is protected the same way", () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const mine = summonCard(g, 0, 'Escyllion Cyclops', 2, 2); mine.ward = true
    summonCard(g, 1, 'Bone Jumble', 2, 2)
    const r = injectPlague(g, 'The Great Famine', 2, 2)
    const cardId = g.auras[r].cardId
    endOfTurn(g, r)
    expect(g.units[mine.id], 'the strongest — warded — survives').toBeTruthy()
    expect(g.units[mine.id].ward).toBeFalsy()
    expect(dispelled(g, r, cardId)).toBe(true)
  })

  it('a tie: choosing the warded one breaks its ward (not at the choice), and the plague is dispelled', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const warded = summonCard(g, 1, 'Stygian Archers', 2, 2); warded.ward = true
    const other = summonCard(g, 1, 'Stygian Archers', 2, 2)
    const r = injectPlague(g, 'The Black Plague', 2, 2)
    const cardId = g.auras[r].cardId
    endOfTurn(g, r)
    expect(g.prompts[0]?.cont).toBe('script:The Black Plague:succumb')
    answer(g, [warded.id])
    expect(g.units[warded.id]?.ward, 'ward broke instead').toBeFalsy()
    expect(g.units[warded.id], 'and it lives').toBeTruthy()
    expect(g.units[other.id], 'the other is untouched').toBeTruthy()
    expect(dispelled(g, r, cardId)).toBe(true)
  })

  it('an unwarded victim dies and the plague stays', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const victim = summonCard(g, 1, 'Stygian Archers', 2, 2)
    const r = injectPlague(g, 'The Black Plague', 2, 2)
    endOfTurn(g, r)
    expect(g.units[victim.id]).toBeUndefined()
    expect(g.auras[r]).toBeTruthy()
  })
})
