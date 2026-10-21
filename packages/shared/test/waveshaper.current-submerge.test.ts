// Waveshaper: "Tap minions without submerge there." Read the minion's CURRENT keywords, not its printed
// ones: a silenced or disabled minion has lost its Submerge, so the wave taps it like any other.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'
import { avatarOf, checkStateBased, type GameState } from '../src'
import '../src/cards/scripts/index'

function waveBoard(): GameState {
  const g = newGame(42, 0); keepBoth(g)
  for (let x = 1; x <= 3; x++) for (let y = 0; y <= 2; y++) placeSite(g, 0, x === 2 && y === 0 ? 'Spring River' : 'Rustic Village', x, y)
  const av = avatarOf(g, 0); av.name = 'Waveshaper'; av.x = 2; av.y = 0; av.tapped = false // stands in its body of water
  return g
}
const wave = (g: GameState) => { act(g, 0, { t: 'activate', sourceId: avatarOf(g, 0).id, ability: 'wave' }); answer(g, { x: 2, y: 1 }) }

describe('Waveshaper taps by CURRENT Submerge', () => {
  it('a Submerge minion keeps its footing', () => {
    const g = waveBoard()
    const kelpie = summonCard(g, 1, 'Coral-Reef Kelpie', 2, 1); kelpie.tapped = false
    wave(g)
    expect(g.units[kelpie.id].tapped).toBe(false)
  })

  it('a SILENCED Submerge minion is tapped', () => {
    const g = waveBoard()
    const kelpie = summonCard(g, 1, 'Coral-Reef Kelpie', 2, 1); kelpie.tapped = false; kelpie.silenced = true
    wave(g)
    expect(g.units[kelpie.id].tapped).toBe(true)
  })

  it('a DISABLED Submerge minion is tapped', () => {
    const g = waveBoard()
    const kelpie = summonCard(g, 1, 'Coral-Reef Kelpie', 2, 1); kelpie.tapped = false
    kelpie.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: g.turn, sourcePlayer: 0 } as any)
    checkStateBased(g)
    wave(g)
    expect(g.units[kelpie.id].tapped).toBe(true)
  })
})
