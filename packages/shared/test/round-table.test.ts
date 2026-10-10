// The Round Table: "Whenever you summon King Arthur, or a Knight, Sir, or Dame to The Round Table,
// draw a card." Knight/Sir/Dame is a NAMING convention (not a subtype) — so "Black Knight", the
// plural "Vanguard Knights", "Sir Gawain" and "Dame Britomart" must all count, while an unrelated
// minion does not.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { getScript, makeCtx, type GameState, type PlayerId } from '../src'

function roundTable(g: GameState, player: PlayerId, x: number, y: number) {
  const cardId = `rt${g.nextId++}`; (g.cards as any)[cardId] = { id: cardId, name: 'The Round Table', owner: player }
  const artId = `art${g.nextId++}`
  ;(g.artifacts as any)[artId] = { id: artId, cardId, name: 'The Round Table', conjuredBy: player, x, y, region: 'surface', carriedBy: null, tapped: false }
  return artId
}

/** fire the Round Table's enter-trigger for a freshly summoned minion AT the table, returning whether
 *  it was seated (drew a card). */
function seats(g: GameState, artId: string, name: string, x: number, y: number): boolean {
  const u = summonCard(g, 0, name, x, y)
  const before = g.log.length
  getScript('The Round Table')!.onUnitEnters!(makeCtx(g, artId, 0, []), u)
  return g.log.slice(before).some((l) => /takes a seat at The Round Table/.test(l.msg))
}

describe('The Round Table — Knight / Sir / Dame / King Arthur all seat', () => {
  it('seats named Knights (incl. the plural Vanguard Knights), Sirs, Dames and King Arthur', () => {
    const g = newGame(); keepBoth(g)
    const art = roundTable(g, 0, 2, 0)
    for (const name of ['Black Knight', 'Vanguard Knights', 'Sir Gawain', 'Dame Britomart', 'King Arthur']) {
      expect(seats(g, art, name, 2, 0), `${name} should be seated`).toBe(true)
    }
  })

  it('does NOT seat an unrelated minion', () => {
    const g = newGame(); keepBoth(g)
    const art = roundTable(g, 0, 2, 0)
    expect(seats(g, art, 'Bone Jumble', 2, 0), 'a plain minion is not a Knight/Sir/Dame').toBe(false)
  })

  it('only seats units summoned ON the table (its own square), controlled by its owner', () => {
    const g = newGame(); keepBoth(g)
    const art = roundTable(g, 0, 2, 0)
    // a Knight summoned on a DIFFERENT square does not seat
    expect(seats(g, art, 'Black Knight', 3, 1), 'off-table knight is not seated').toBe(false)
    // an ENEMY knight on the table does not seat (controller !== owner)
    const enemyKnight = summonCard(g, 1, 'Black Knight', 2, 0)
    const before = g.log.length
    getScript('The Round Table')!.onUnitEnters!(makeCtx(g, art, 0, []), enemyKnight)
    expect(g.log.slice(before).some((l) => /takes a seat/.test(l.msg)), 'enemy knight not seated').toBe(false)
  })
})
