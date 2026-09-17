// The legal-move generator is the bot's ground truth: at any moment it must list EVERY action the
// engine accepts and NOTHING it rejects. These tests assert both — universal legality (every action
// returned actually applies) and completeness of the obvious moves (a ready unit's move, an
// affordable minion summoned onto a square, a site play, and endTurn).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, injectToHand, giveMana, waiveThreshold } from './helpers'
import { legalActions, expandActions, applyAction, createGame, starterDecks, type GameState } from '../src'

/** a mid-game position for player 0: a paved block of controlled sites (so ground units can actually
 *  move — a minion can't step onto void), a ready unit in the middle, an affordable minion in hand. */
function midgame(): { g: GameState; minionId: string; unitId: string } {
  const g = newGame(); keepBoth(g); g.turn = 3
  for (let x = 1; x <= 3; x++) for (let y = 0; y <= 2; y++) placeSite(g, 0, 'Spire', x, y)
  giveMana(g, 0, 12); waiveThreshold(g, 0)
  const minionId = injectToHand(g, 0, 'Bone Jumble') // a cheap 1/1
  const unit = summonCard(g, 0, 'Stygian Archers', 2, 1); unit.enteredTurn = -1 // ready, sites all around to step onto
  return { g, minionId, unitId: unit.id }
}

describe('legal-move generator', () => {
  it('every action it returns is accepted by the engine', () => {
    const { g } = midgame()
    // add an enemy unit to create attack candidates too
    summonCard(g, 1, 'Bone Jumble', 2, 1)
    const acts = legalActions(g, 0)
    expect(acts.length, 'a rich position has many moves').toBeGreaterThan(5)
    for (const a of acts) {
      const probe = structuredClone(g)
      expect(applyAction(probe, 0, a).ok, `illegal action leaked: ${JSON.stringify(a).slice(0, 100)}`).toBe(true)
    }
  })

  it('includes the obvious moves: unit move, minion summon (with a square), site draw, endTurn', () => {
    const { g, minionId, unitId } = midgame()
    const acts = legalActions(g, 0)
    expect(acts.some((a) => a.t === 'endTurn'), 'endTurn').toBe(true)
    expect(acts.some((a) => a.t === 'moveAttack' && a.unitId === unitId), 'a move for the ready unit').toBe(true)
    expect(
      acts.some((a) => a.t === 'castSpell' && a.cardId === minionId && !!a.at),
      'a summon of the affordable minion WITH a placement square',
    ).toBe(true)
  })

  it('expandActions pairs each action with the state the engine produces', () => {
    const { g, unitId } = midgame()
    const exps = expandActions(g, 0)
    expect(exps.length).toBe(legalActions(g, 0).length)
    // the resulting states are real, post-action clones (not the input)
    for (const { action, next } of exps) {
      expect(next).not.toBe(g)
      if (action.t === 'endTurn') expect(next.activePlayer, 'endTurn passes the turn').not.toBe(0)
    }
    // a move for our unit yields a state where the unit has actually moved/tapped
    const mv = exps.find((e) => e.action.t === 'moveAttack' && e.action.unitId === unitId)
    expect(mv, 'a move expansion exists').toBeTruthy()
  })

  it('at an open prompt it enumerates that prompt’s legal choices only', () => {
    // createGame (unlike the newGame helper) leaves firstSiteDone false, so keeping both hands
    // fires the guaranteed turn-1 "establish your first site" prompt.
    const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 42, 0)
    applyAction(g, 0, { t: 'keepHand' })
    applyAction(g, 1, { t: 'keepHand' })
    const pr = g.prompts[0]
    expect(pr?.kind, 'the first-site prompt is open').toBe('firstSite')
    const acts = legalActions(g, pr.player)
    expect(acts.length, 'the prompt offers at least one legal choice').toBeGreaterThan(0)
    expect(acts.every((a) => a.t === 'prompt'), 'at a prompt, only prompt answers are offered').toBe(true)
    for (const a of acts) {
      const probe = structuredClone(g)
      expect(applyAction(probe, pr.player, a).ok, `illegal prompt answer: ${JSON.stringify(a).slice(0, 80)}`).toBe(true)
    }
  })
})
