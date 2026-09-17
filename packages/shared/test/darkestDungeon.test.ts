// Darkest Dungeon: "the next time an ally strikes an Avatar this turn, drag both here IF ABLE."
// A trapped avatar (Sphere of Animosity — can't leave its area) can't be dragged to a dungeon
// OUTSIDE that area, so the effect must not activate (and stays armed for a later legal strike).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { emitEvent, avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

function armedDungeon() {
  const g: GameState = newGame(); keepBoth(g)
  const dungeon = placeSite(g, 0, 'Darkest Dungeon', 0, 0)
  // arm it exactly as its genesis does
  g.flow = { ...(g.flow ?? {}), darkestDungeon: { siteId: dungeon.id, player: 0, turn: g.turn } } as any
  const avatar = avatarOf(g, 1)
  avatar.x = 3; avatar.y = 3; avatar.region = 'surface'
  const striker = summonCard(g, 0, 'Foot Soldier', 3, 3)
  return { g, dungeon, avatar, striker }
}

describe('Darkest Dungeon — drag both here IF ABLE', () => {
  it('does NOT drag a trapped avatar when the dungeon is outside the trap (Sphere of Animosity)', () => {
    const { g, avatar, striker } = armedDungeon()
    // the Sphere traps the avatar at (3,3); it does NOT cover the dungeon at (0,0)
    g.auras['sphere1'] = { id: 'sphere1', name: 'Sphere of Animosity', controller: 0, squares: [{ x: 3, y: 3 }] } as any
    emitEvent(g, 'onAllyStrikesAvatar', striker, avatar)
    expect([avatar.x, avatar.y], 'avatar cannot be dragged out of the Sphere').toEqual([3, 3])
    expect([striker.x, striker.y], 'striker is not dragged either').toEqual([3, 3])
    expect(g.flow?.darkestDungeon, 'stays armed — it did not activate').toBeTruthy()
  })

  it('DOES drag both when the trap also covers the dungeon (avatar can reach)', () => {
    const { g, avatar, striker } = armedDungeon()
    // the Sphere covers BOTH the avatar and the dungeon → the avatar can move within it
    g.auras['sphere1'] = { id: 'sphere1', name: 'Sphere of Animosity', controller: 0, squares: [{ x: 3, y: 3 }, { x: 0, y: 0 }] } as any
    emitEvent(g, 'onAllyStrikesAvatar', striker, avatar)
    expect([avatar.x, avatar.y], 'dragged into the dungeon').toEqual([0, 0])
    expect(g.flow?.darkestDungeon ?? null, 'consumed after firing').toBeNull()
  })

  it('drags both into the dungeon when the avatar is not trapped at all', () => {
    const { g, avatar, striker } = armedDungeon()
    emitEvent(g, 'onAllyStrikesAvatar', striker, avatar)
    expect([avatar.x, avatar.y], 'avatar dragged in').toEqual([0, 0])
    expect([striker.x, striker.y], 'striker dragged in').toEqual([0, 0])
    expect(g.flow?.darkestDungeon ?? null, 'consumed after firing').toBeNull()
  })
})
