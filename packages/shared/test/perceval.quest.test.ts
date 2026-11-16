// Sir Perceval: 'Genesis → An opponent chooses a site. When Sir Perceval enters that site, draw a card,
// then reactivate his Genesis ability.' The quest is the chosen SITE (flow.percevalQuest: unit id → site
// id), so it follows a moved site; the client plants a 🚩 on it.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, waiveThreshold, answer, act, settlePrompts } from './helpers'
import { type GameState } from '../src'
import { percevalQuestSite } from '../src/cards/scripts/gen/sir-perceval'

function setup() {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  for (const s of Object.values(g.sites)) delete g.sites[s.id]
  placeSite(g, 0, 'Rustic Village', 2, 1)
  const goal = placeSite(g, 1, 'Rustic Village', 3, 1)
  placeSite(g, 1, 'Rustic Village', 3, 2)
  castMagic(g, 0, 'Sir Perceval', { at: { x: 2, y: 1 } })
  const perc = Object.values(g.units).find((u) => u.name === 'Sir Perceval')!
  expect(g.prompts[0]?.player, 'the OPPONENT chooses the quest').toBe(1)
  answer(g, { x: 3, y: 1 })
  return { g, perc, goal }
}

describe('Sir Perceval\'s quest', () => {
  it('the opponent picks a site; it is remembered as that site', () => {
    const { g, perc, goal } = setup()
    expect(g.flow.percevalQuest[perc.id]).toBe(goal.id)
    expect(percevalQuestSite(g, perc.id)?.id).toBe(goal.id)
  })

  it('entering it draws a card and starts a new quest', () => {
    const { g, perc } = setup()
    perc.enteredTurn = -1
    const hand = g.players[0].hand.length
    act(g, 0, { t: 'moveAttack', unitId: perc.id, path: [{ x: 3, y: 1, region: 'surface' }] })
    expect(g.prompts[0]?.kind, '"draw a card": spellbook or atlas').toBe('drawDeck')
    answer(g, 'spellbook')
    expect(g.players[0].hand.length).toBe(hand + 1)
    expect(g.flow.percevalQuest[perc.id], 'quest complete').toBeUndefined()
    expect(g.prompts[0]?.player, 'the opponent picks the next quest').toBe(1)
    answer(g, { x: 3, y: 2 })
    settlePrompts(g)
    expect(percevalQuestSite(g, perc.id)?.x).toBe(3)
    expect(percevalQuestSite(g, perc.id)?.y).toBe(2)
  })

  it('the quest follows its site when the site moves', () => {
    const { g, perc, goal } = setup()
    // swap the goal with its neighbour (e.g. rearranged by Earthquake): (3,1) now holds the OTHER site
    const other = Object.values(g.sites).find((s) => s.x === 3 && s.y === 2)!
    other.y = 1; goal.y = 2
    perc.enteredTurn = -1
    const hand = g.players[0].hand.length
    act(g, 0, { t: 'moveAttack', unitId: perc.id, path: [{ x: 3, y: 1, region: 'surface' }] })
    expect(g.players[0].hand.length, 'the old square is no longer the goal').toBe(hand)
    expect(percevalQuestSite(g, perc.id)?.id).toBe(goal.id)
  })

  it('two Percevals keep independent quests', () => {
    const { g, perc: p1, goal: g1 } = setup()
    castMagic(g, 0, 'Sir Perceval', { at: { x: 2, y: 1 } })
    const p2 = Object.values(g.units).find((u) => u.name === 'Sir Perceval' && u.id !== p1.id)!
    answer(g, { x: 3, y: 2 })
    const g2 = Object.values(g.sites).find((s) => s.x === 3 && s.y === 2)!
    expect(g.flow.percevalQuest).toEqual({ [p1.id]: g1.id, [p2.id]: g2.id })
    // the SECOND steps onto the FIRST one's goal: not his quest — nothing happens
    p2.enteredTurn = -1
    act(g, 0, { t: 'moveAttack', unitId: p2.id, path: [{ x: 3, y: 1, region: 'surface' }] })
    settlePrompts(g)
    expect(g.flow.percevalQuest).toEqual({ [p1.id]: g1.id, [p2.id]: g2.id })
    // the FIRST steps onto his own goal: only HIS quest completes; the second's is untouched
    p1.enteredTurn = -1
    const hand = g.players[0].hand.length
    act(g, 0, { t: 'moveAttack', unitId: p1.id, path: [{ x: 3, y: 1, region: 'surface' }] })
    answer(g, 'spellbook')
    expect(g.players[0].hand.length).toBe(hand + 1)
    expect(g.flow.percevalQuest[p1.id], 'the first quest is done').toBeUndefined()
    expect(g.flow.percevalQuest[p2.id], 'the second still quests for his own site').toBe(g2.id)
  })
})
