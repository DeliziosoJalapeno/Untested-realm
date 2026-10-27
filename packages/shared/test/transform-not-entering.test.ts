// Transforming is NOT entering: the new form takes the old one's place, and "whenever … enters" effects
// (a flipped Druid's thorns on its nearby sites), summon bans and summon taxes don't apply to it.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, castMagic, waiveThreshold, placeSite } from './helpers'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

// my minion stands on an ENEMY site, nearby the enemy's flipped Druid ("an enemy enters here → 1 damage")
function underTheDruid() {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  const me = avatarOf(g, 0)
  const druid = avatarOf(g, 1)
  druid.name = 'Druid'; druid.flipped = true; druid.x = me.x; druid.y = me.y + 2
  placeSite(g, 1, 'Rustic Village', me.x, me.y + 1)
  const victim = summonCard(g, 0, 'Bone Jumble', me.x, me.y + 1)
  victim.enteredTurn = g.turn - 1
  return { g, victim }
}
const at = (g: GameState, x: number, y: number) => Object.values(g.units).filter((u) => u.x === x && u.y === y && !u.isAvatar)

describe('transforms are not entries', () => {
  it("Pollimorph's Frog doesn't 'enter' the Druid's site — no thorns", () => {
    const { g, victim } = underTheDruid()
    const { x, y } = victim
    castMagic(g, 0, 'Pollimorph', { targets: [victim.id] })
    const [frog] = at(g, x, y)
    expect(frog?.name).toBe('Frog')
    expect(frog.damage ?? 0, 'no thorns').toBe(0)
    expect(frog.enteredTurn, 'keeps its summoning status').toBe(g.turn - 1)
  })

  it("Degradation's Foot Soldier doesn't 'enter' either", () => {
    const { g, victim } = underTheDruid()
    const { x, y } = victim
    const mortal = summonCard(g, 0, 'Eltham Townsfolk', x, y) // a vanilla Mortal
    castMagic(g, 0, 'Degradation', { targets: [mortal.id] })
    const soldier = at(g, x, y).find((u) => u.name === 'Foot Soldier')
    expect(soldier, 'transformed').toBeTruthy()
    expect(soldier!.damage ?? 0, 'no thorns').toBe(0)
  })
})
