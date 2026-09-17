// Pied Piper of Hameln ("you control all minions with 1 or less power") is a CONTINUOUS control
// ability: its claimed court reverts to each minion's previous controller the moment the Piper can
// no longer exert it — when it leaves the realm (dies/banished, via flow.kingsCourt) OR is silenced
// or disabled (releaseControlWhenHushed, settled in checkStateBased).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { getScript, makeCtx, killUnit, banishUnit, checkStateBased, type GameState } from '../src'
import '../src/cards/scripts/index'

function claim(g: GameState, piperId: string) {
  getScript('Pied Piper of Hameln')!.startOfTurn!(makeCtx(g, piperId, 0, []))
}
function setup() {
  const g = newGame() as GameState; keepBoth(g)
  const foe = summonCard(g, 1, 'Bone Jumble', 3, 3) // 1/1 → avg power 1, weak enough to charm
  const piper = summonCard(g, 0, 'Pied Piper of Hameln', 2, 2)
  claim(g, piper.id)
  expect(g.units[foe.id].controller, 'the Piper charms the weak enemy').toBe(0)
  return { g, foe, piper }
}

describe('Pied Piper returns its court when it can no longer charm', () => {
  it('reverts a claimed minion when the Piper DIES', () => {
    const { g, foe, piper } = setup()
    killUnit(g, piper.id)
    expect(g.units[foe.id].controller, 'freed to its owner when the Piper dies').toBe(1)
  })

  it('reverts when the Piper is BANISHED (leaves without dying)', () => {
    const { g, foe, piper } = setup()
    banishUnit(g, piper.id)
    expect(g.units[foe.id].controller, 'freed on exile too').toBe(1)
  })

  it('reverts when the Piper is SILENCED', () => {
    const { g, foe, piper } = setup()
    g.units[piper.id].silenced = true
    checkStateBased(g)
    expect(g.units[foe.id].controller, 'a silenced Piper loses the charm').toBe(1)
  })

  it('reverts when the Piper is DISABLED', () => {
    const { g, foe, piper } = setup()
    // a disable source next to the Piper — Stone-gaze Gorgons disable adjacent minions
    const gorgon = summonCard(g, 1, 'Stone-gaze Gorgons', 2, 1) // adjacent to the Piper at (2,2)
    gorgon.enteredTurn = -1
    checkStateBased(g)
    expect(g.units[foe.id].controller, 'a disabled Piper loses the charm').toBe(1)
  })
})
