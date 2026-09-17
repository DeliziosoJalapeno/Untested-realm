// Arjaro Exorcist's Genesis can exorcise a nearby AURA, not only Demons/Spirits. The
// engine already supported it; the bug was purely GUI (the prompt was tagged kind:'unit'
// so auras weren't clickable). These tests lock in the engine behaviour: the genesis
// prompt lists a nearby aura as a candidate (with kind 'unitOrAura'), and answering with
// the aura id removes it from the realm.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'

function injectAura(g: GameState, name: string, squares: { x: number; y: number }[]): string {
  const cardId = `ac${g.nextId++}`
  ;(g.cards as any)[cardId] = { id: cardId, name, owner: 1 }
  const id = `r${g.nextId++}`
  ;(g.auras as any)[id] = { id, cardId, name, controller: 1, squares, anchor: squares[0], enteredTurn: 0 }
  return id
}

describe('Arjaro Exorcist — Genesis can exorcise a nearby aura', () => {
  it('offers an adjacent aura as a candidate, tagged unit-or-aura', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    const self = summonCard(g, 0, 'Arjaro Exorcist', 2, 2)
    const auraId = injectAura(g, 'Eclipse', [{ x: 2, y: 3 }]) // adjacent to (2,2)
    let asked: any = null
    const ctx = makeCtx(g, self.id, 0, [])
    ;(ctx as any).ask = (p: any) => { asked = p }
    getScript('Arjaro Exorcist')!.genesis!(ctx)
    expect(asked, 'a prompt was raised').toBeTruthy()
    expect(asked.data.kind, 'mixed unit/aura prompt so the GUI makes auras clickable').toBe('unitOrAura')
    expect(asked.data.candidates, 'the nearby aura is a candidate').toContain(auraId)
  })

  it('answering with the aura id removes it from the realm', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    const self = summonCard(g, 0, 'Arjaro Exorcist', 2, 2)
    const auraId = injectAura(g, 'Eclipse', [{ x: 2, y: 3 }])
    expect(g.auras[auraId]).toBeTruthy()
    getScript('Arjaro Exorcist')!.conts!.exorcise(makeCtx(g, self.id, 0, []), {}, [auraId])
    expect(g.auras[auraId], 'the aura is exorcised').toBeUndefined()
  })

  it('a NON-adjacent aura is not offered', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    const self = summonCard(g, 0, 'Arjaro Exorcist', 0, 0)
    const auraId = injectAura(g, 'Eclipse', [{ x: 4, y: 4 }]) // far away
    let asked: any = null
    const ctx = makeCtx(g, self.id, 0, [])
    ;(ctx as any).ask = (p: any) => { asked = p }
    getScript('Arjaro Exorcist')!.genesis!(ctx)
    // no candidates at all → no prompt raised
    if (asked) expect(asked.data.candidates).not.toContain(auraId)
    else expect(asked).toBeNull()
  })
})
