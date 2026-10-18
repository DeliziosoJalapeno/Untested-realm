// The bot may cast a MAGIC from one of its Spellcaster minions, not just its avatar — but only when where the
// spell is cast from changes what it can reach (a projectile, a target nearby/adjacent the caster, an area
// measured from the caster). A spell that reaches anywhere stays avatar-only, so the search isn't flooded with
// duplicate casts.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, injectToHand, waiveThreshold } from './helpers'
import { expandActions, avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

function board(): { g: GameState; wizard: string } {
  const g = newGame(42, 0); keepBoth(g)
  for (let x = 0; x <= 4; x++) for (let y = 0; y <= 3; y++) placeSite(g, 0, 'Active Volcano', x, y)
  const w = summonCard(g, 0, 'Apprentice Wizard', 2, 2); w.enteredTurn = 0
  summonCard(g, 1, 'Bone Jumble', 2, 3) // something for the projectile to hit
  waiveThreshold(g, 0)
  g.players[0].mana = 20
  return { g, wizard: w.id }
}
const castersOf = (g: GameState, cardId: string, minionCasters: boolean) =>
  new Set(expandActions(g, 0, { minionCasters }).filter((e) => e.action.t === 'castSpell' && (e.action as any).cardId === cardId).map((e) => (e.action as any).casterId))

describe('bot move generation: magic cast by Spellcaster minions', () => {
  it('a position-dependent magic (projectile) is offered from the Spellcaster minion too', () => {
    const { g, wizard } = board()
    const bolts = injectToHand(g, 0, 'Firebolts')
    const casters = castersOf(g, bolts, true)
    expect(casters.has(avatarOf(g, 0).id)).toBe(true)
    expect(casters.has(wizard), 'the Apprentice Wizard may cast it').toBe(true)
  })

  it('a magic that reaches anywhere stays avatar-only', () => {
    const { g, wizard } = board()
    const sense = injectToHand(g, 0, 'Common Sense')
    expect(castersOf(g, sense, true).has(wizard)).toBe(false)
  })

  it('with the option off, only the avatar casts', () => {
    const { g, wizard } = board()
    const bolts = injectToHand(g, 0, 'Firebolts')
    expect(castersOf(g, bolts, false).has(wizard)).toBe(false)
  })
})
