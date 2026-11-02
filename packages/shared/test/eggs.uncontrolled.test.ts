// "At the end of each turn, the controller of Angel's/Devil's Egg's site heals/loses 1 life." The Egg is
// a carriable artifact, so on the ground it's uncontrolled (Rulebook, "Controlling Artifacts") — but its
// effect names the SITE's controller, not the Egg's, so it keeps working there (actsUncontrolled).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { avatarOf, type GameState } from '../src'
import { beginTurn, endTurn } from '../src/engine/turn'
import '../src/cards/scripts/index'

function egg(g: GameState, name: string, x: number, y: number, carriedBy: string | null = null): string {
  const cid = `ctest${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: 0 } as any
  const aid = `atest${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name, conjuredBy: 0, x, y, region: 'surface', carriedBy, tapped: false }
  return aid
}

function endOfTurn(name: string, carried: boolean): [number, number] {
  const g = newGame() as GameState; keepBoth(g)
  placeSite(g, 1, 'Rustic Village', 2, 2) // the Egg's site is the OPPONENT's
  const bearer = summonCard(g, 0, 'Bone Jumble', 2, 2)
  const a = egg(g, name, 2, 2, carried ? bearer.id : null)
  if (carried) bearer.carrying.push(a)
  avatarOf(g, 0).life = 10; avatarOf(g, 1).life = 10
  endTurn(g); beginTurn(g, 1)
  return [avatarOf(g, 0).life ?? 0, avatarOf(g, 1).life ?? 0]
}

describe("Angel's Egg and Devil's Egg work wherever they are", () => {
  it("Angel's Egg on the ground heals its site's controller", () => {
    expect(endOfTurn("Angel's Egg", false)).toEqual([10, 11])
  })
  it("Devil's Egg on the ground drains its site's controller", () => {
    expect(endOfTurn("Devil's Egg", false)).toEqual([10, 9])
  })
  it('carried, it still affects the site\'s controller, not the bearer\'s', () => {
    expect(endOfTurn("Angel's Egg", true)).toEqual([10, 11])
    expect(endOfTurn("Devil's Egg", true)).toEqual([10, 9])
  })
})
