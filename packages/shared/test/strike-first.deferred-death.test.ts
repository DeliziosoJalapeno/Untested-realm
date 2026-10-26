// Strike First (and a Lance's first strike): "Units that strike first resolve their strikes before their
// target can resolve theirs … Then any SURVIVING units without that ability make their strikes." A target
// killed by the first strike never strikes back — even one whose Deathrite asks a question (Estranged
// Loner), whose death is held open while the question is answered: it used to linger and strike back.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, act, answer, defaultAnswer, giveArtifact } from './helpers'
import { type GameState } from '../src'
import '../src/cards/scripts/index'

function fight(defName: string, arm: (g: GameState, a: any) => void) {
  const g = newGame() as GameState; keepBoth(g)
  placeSite(g, 0, 'Rustic Village', 2, 1)
  const a = summonCard(g, 0, 'Shameless Squire', 2, 1); a.enteredTurn = -1 // 1/1
  arm(g, a)
  const d = summonCard(g, 1, defName, 2, 1); d.enteredTurn = -1
  act(g, 0, { t: 'moveAttack', unitId: a.id, path: [], attack: { unit: d.id } })
  for (let i = 0; i < 20 && g.prompts.length; i++) { const p = g.prompts[0]; answer(g, p.kind === 'defend' ? [] : defaultAnswer(p)) }
  return { g, a, d }
}
const withLance = (g: GameState, a: any) => { giveArtifact(g, a, 'Lance') } // +1 and strikes first → 2
const strikeFirstPlus1 = (g: GameState, a: any) => {
  a.modifiers.push({ kind: 'keyword', keyword: 'strikeFirst', duration: 'permanent', turn: 0, sourcePlayer: 0 })
  a.modifiers.push({ kind: 'power', amount: 1, duration: 'permanent', turn: 0, sourcePlayer: 0 })
}

describe('a target killed by a first strike never strikes back', () => {
  for (const [how, arm] of [['Lance', withLance], ['Strike First', strikeFirstPlus1]] as const) {
    it(`${how}: kills a plain 2/2 and takes no damage`, () => {
      const { g, a, d } = fight('Kettletop Leprechaun', arm)
      expect(g.units[d.id]).toBeUndefined()
      expect(g.units[a.id]?.damage).toBe(0)
    })

    it(`${how}: kills Estranged Loner (its Deathrite asks a question) and takes no damage`, () => {
      const { g, a, d } = fight('Estranged Loner', arm)
      expect(g.units[d.id]).toBeUndefined()
      expect(g.units[a.id], 'the attacker survives').toBeDefined()
      expect(g.units[a.id]?.damage).toBe(0)
    })
  }

  it('a target that SURVIVES the first strike still strikes back', () => {
    const { g, a, d } = fight('Dame Britomart', withLance) // 3/5 survives 2 damage
    expect(g.units[d.id]?.damage).toBe(2)
    expect(g.units[a.id], 'Britomart strikes back and kills the 1/1 squire').toBeUndefined()
  })
})
