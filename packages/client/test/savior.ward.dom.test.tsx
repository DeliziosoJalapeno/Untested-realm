// GUI convenience: when YOU pilot a Savior and successfully summon a minion, a non-blocking
// banner offers to ward it — a shortcut to the SAME "(1) → Ward a minion summoned this turn"
// ability (no engine change). Only for your own, wardable, freshly-summoned minions.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function base(avatarName: string) {
  const g = sweepBoardBase() as any
  const me = hotseatViewpoint(g)
  const av = g.units[g.players[me].avatarUnitId]
  av.name = avatarName; g.cards[av.cardId].name = avatarName
  g.players[me].mana = 5
  return { g, me }
}

function addMinion(g: any, me: 0 | 1, name: string) {
  const cardId = `csv${g.nextId++}`
  g.cards[cardId] = { id: cardId, name, owner: me }
  const id = `usv${g.nextId++}`
  g.units[id] = {
    id, cardId, name, owner: me, controller: me, isAvatar: false,
    x: 0, y: 0, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
    modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
  return id
}

describe('Savior ward offer (GUI shortcut to the existing (1) ward ability)', () => {
  it('offers to ward a freshly-summoned own minion, and Ward applies the existing ability', () => {
    const { g, me } = base('Savior')
    const mid = addMinion(g, me, 'Common Cottagers') // a plain (non-Evil) minion summoned this turn
    const h = new GameHarness(g).mount(); active = h

    const offer = h.container.querySelector(`[data-savior-offer="${mid}"]`) as HTMLElement
    expect(offer, 'the ward offer appeared').toBeTruthy()

    h.click(offer.querySelector('[data-confirm]') as HTMLButtonElement) // 🛡 Ward (1)
    h.rerender()
    expect(h.state.units[mid].ward, 'the minion is now warded via the Savior ability').toBe(true)
    expect(h.container.querySelector('[data-savior-offer]'), 'the offer dismissed').toBeFalsy()
  })

  it('does NOT offer when your avatar is not a Savior', () => {
    const { g, me } = base('Sorcerer')
    addMinion(g, me, 'Common Cottagers')
    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('[data-savior-offer]'), 'no Savior → no offer').toBeFalsy()
  })

  it('does NOT offer for an Evil minion (it can\'t be warded)', () => {
    const { g, me } = base('Savior')
    addMinion(g, me, 'Death Knight') // Undead ⇒ Evil ⇒ not wardable
    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('[data-savior-offer]'), 'Evil minion is not offered').toBeFalsy()
  })
})
