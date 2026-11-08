// Yog-Sothoth's "occupies all locations" is a characteristic (FAQ: it stays even when silenced or disabled), so
// it follows the card's NAME, not its Genesis: a minion Shapeshifted INTO Yog-Sothoth covers the whole realm at
// once (and meets its five-void check), and a Yog-Sothoth Shapeshifted into something else shrinks back.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, injectToHand, castMagic, answer, waiveThreshold } from './helpers'
import { occupiedSquares, GRID_W, GRID_H, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

function board(voidRow: boolean): { g: GameState; p: PlayerId } {
  const g = newGame(); keepBoth(g)
  const p = g.activePlayer
  for (const s of Object.values(g.sites)) delete g.sites[s.id]
  for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) if (!voidRow || y !== 3) placeSite(g, p, 'Rustic Village', x, y)
  return { g, p }
}
function shapeshiftInto(g: GameState, p: PlayerId, unitId: string, form: string) {
  const formCard = injectToHand(g, p, form)
  const hand = g.players[p].hand
  hand.splice(hand.indexOf(formCard), 1)
  g.players[p].spellbook.unshift(formCard) // the next spell is the new form
  waiveThreshold(g, p)
  castMagic(g, p, 'Shapeshift', { targets: [unitId] })
  answer(g, [0])
}

describe('Yog-Sothoth through Shapeshift', () => {
  it('a minion Shapeshifted into Yog-Sothoth occupies every location', () => {
    const { g, p } = board(true)
    const u = summonCard(g, p, 'Foot Soldier', 1, 1)
    shapeshiftInto(g, p, u.id, 'Yog-Sothoth')
    expect(g.units[u.id].name).toBe('Yog-Sothoth')
    expect(occupiedSquares(g.units[u.id]).length).toBe(GRID_W * GRID_H)
  })

  it('without five voids the new Yog-Sothoth is banished at once', () => {
    const { g, p } = board(false)
    const u = summonCard(g, p, 'Foot Soldier', 1, 1)
    shapeshiftInto(g, p, u.id, 'Yog-Sothoth')
    expect(g.units[u.id]).toBeUndefined()
  })

  it('a Yog-Sothoth Shapeshifted into another minion shrinks to its own square', () => {
    const { g, p } = board(true)
    const yog = summonCard(g, p, 'Yog-Sothoth', 1, 1)
    shapeshiftInto(g, p, yog.id, 'Foot Soldier') // (summonCard skips Genesis: the board settle applies the footprint)
    expect(g.units[yog.id].name).toBe('Foot Soldier')
    expect(occupiedSquares(g.units[yog.id]).length).toBe(1)
  })
})
