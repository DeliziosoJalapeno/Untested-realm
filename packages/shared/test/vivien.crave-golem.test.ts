// Vivien "has the other printed abilities of all Avatars and Spellcasters in the realm" — including
// their TRIGGERED "start of each turn" abilities. A spellcaster Crave Golem ("at the start of each
// player's turn it attacks / lumbers toward prey") wasn't being copied because Vivien forwarded
// startOfTurn/endOfTurn but not startOfEachTurn.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { getScript, makeCtx, type UnitState } from '../src'

const makeSpellcaster = (u: UnitState) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'spellcaster', duration: 'permanent', turn: 0, sourcePlayer: 0 } as any)

function setup(golemIsSpellcaster: boolean) {
  const g: any = newGame(); keepBoth(g); g.turn = 3
  for (let x = 0; x < 5; x++) placeSite(g, 0, 'Spire', x, 1) // a corridor to lumber along
  const viv = summonCard(g, 0, 'Vivien the Enchantress', 0, 1); viv.enteredTurn = -5
  const golem = summonCard(g, 0, 'Crave Golem', 3, 3); golem.enteredTurn = -5 // off the corridor, out of the way
  if (golemIsSpellcaster) makeSpellcaster(golem)
  summonCard(g, 1, 'Bone Jumble', 4, 1); // enemy prey, too far for a 1-step reach
  return { g, viv }
}

describe('Vivien copies a spellcaster Crave Golem', () => {
  it('takes the hungry step toward prey (inherits its start-of-each-turn ability)', () => {
    const { g, viv } = setup(true)
    getScript('Vivien the Enchantress')!.startOfEachTurn!(makeCtx(g, viv.id, 0, []), 0)
    expect(g.units[viv.id].x, 'Vivien lumbers one step toward the far minion').toBe(1)
  })

  it('does nothing when the Golem is NOT a spellcaster (not a Vivien source)', () => {
    const { g, viv } = setup(false)
    getScript('Vivien the Enchantress')!.startOfEachTurn!(makeCtx(g, viv.id, 0, []), 0)
    expect(g.units[viv.id].x, 'no copied ability → Vivien stays put').toBe(0)
  })
})
