// A subsurface (buried/submerged) ground artifact shows a ⛏ / 🌊 badge on the board.
import { describe, it, expect, afterEach } from 'vitest'
import { board, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function groundArt(region: 'underground' | 'underwater'): GameState {
  const g = board() as any
  g.cards['cbur'] = { id: 'cbur', name: 'Poisonous Dagger', owner: 0 }
  g.artifacts['abur'] = { id: 'abur', cardId: 'cbur', name: 'Poisonous Dagger', conjuredBy: 0, x: 1, y: 1, region, carriedBy: null, tapped: false }
  return g
}

describe('subsurface ground-artifact badge', () => {
  it('a buried artifact shows the ⛏ badge', () => {
    const h = new GameHarness(groundArt('underground')).mount(); active = h
    const badge = h.container.querySelector('[data-artregion="underground"]')
    expect(badge, 'buried artifact shows a region badge').toBeTruthy()
    expect(badge?.textContent).toContain('⛏')
  })

  it('a submerged artifact shows the 🌊 badge', () => {
    const h = new GameHarness(groundArt('underwater')).mount(); active = h
    const badge = h.container.querySelector('[data-artregion="underwater"]')
    expect(badge, 'submerged artifact shows a region badge').toBeTruthy()
    expect(badge?.textContent).toContain('🌊')
  })

  it('a surface artifact shows no region badge', () => {
    const h = new GameHarness(groundArt('underground' as any)).mount()
    active = h
    // sanity: swap to surface has no badge
    active.unmount()
    const g = board() as any
    g.cards['cs'] = { id: 'cs', name: 'Poisonous Dagger', owner: 0 }
    g.artifacts['as'] = { id: 'as', cardId: 'cs', name: 'Poisonous Dagger', conjuredBy: 0, x: 1, y: 1, region: 'surface', carriedBy: null, tapped: false }
    const h2 = new GameHarness(g).mount(); active = h2
    expect(h2.container.querySelector('[data-artregion]'), 'surface artifact has no region badge').toBeFalsy()
  })
})
