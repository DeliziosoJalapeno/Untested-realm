import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, act } from './helpers'

// Locusts of Illyria: "At the end of your turn, if no new Locusts have been summoned this
// turn, summon a tapped copy of this nearby." FAQ: "new" = copies made by the ability, and
// with 2+ Locusts in the realm you get exactly ONE more per turn — even though each Locust
// has the trigger. A copy may spread onto a NEARBY site of either player's.
function driveLocustPrompts(g: any, cap = 20) {
  for (let i = 0; i < cap; i++) {
    const p = g.prompts[0]
    if (!p) break
    if (p.kind === 'orderCards') {
      const n = (p.data.cards ?? []).length
      act(g, p.player, { t: 'prompt', promptId: p.id, choice: Array.from({ length: n }, (_, k) => k) })
    } else if (p.kind === 'chooseSquare') {
      act(g, p.player, { t: 'prompt', promptId: p.id, choice: p.data.squares?.[0] })
    } else if (p.kind === 'drawDeck') {
      act(g, p.player, { t: 'prompt', promptId: p.id, choice: 'spellbook' })
    } else break
  }
}
const countLocusts = (g: any) => Object.values(g.units).filter((u: any) => u.name === 'Locusts of Illyria').length

describe('Locusts of Illyria — at most one spread per turn across all Locusts', () => {
  it('two allied Locusts summon exactly ONE copy at end of turn (not one each)', () => {
    const g = newGame(42, 0); keepBoth(g)
    for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) placeSite(g, 0, 'Active Volcano', x, y)
    summonCard(g, 0, 'Locusts of Illyria', 2, 2).enteredTurn = -5
    summonCard(g, 0, 'Locusts of Illyria', 2, 3).enteredTurn = -5
    act(g, 0, { t: 'endTurn' })
    driveLocustPrompts(g)
    expect(countLocusts(g), '2 original + 1 spread').toBe(3)
  })

  it('a lone Locust still spreads one copy', () => {
    const g = newGame(42, 0); keepBoth(g)
    for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) placeSite(g, 0, 'Active Volcano', x, y)
    summonCard(g, 0, 'Locusts of Illyria', 2, 2).enteredTurn = -5
    act(g, 0, { t: 'endTurn' })
    driveLocustPrompts(g)
    expect(countLocusts(g)).toBe(2)
  })

  it('a copy may spread onto a nearby ENEMY site', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1) // the only nearby site is enemy-controlled
    summonCard(g, 0, 'Locusts of Illyria', 2, 2).enteredTurn = -5
    act(g, 0, { t: 'endTurn' })
    driveLocustPrompts(g)
    const onEnemy = Object.values(g.units).find((u: any) => u.name === 'Locusts of Illyria' && u.x === 2 && u.y === 1)
    expect(onEnemy, 'a copy spread onto the nearby enemy site').toBeTruthy()
  })
})
