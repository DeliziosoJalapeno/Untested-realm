// Two UX guards:
//  1. A summoning-sick (or tapped / disabled) minion can neither move nor attack (Move-and-Attack is one
//     Tap ability), so selecting it must paint NO move highlights and offer no attack.
//  2. Selecting a READY minion glows every enemy sharing its square as an attack target ('atk' → a gold
//     glow + an "⚔ Attack <name>" hover tooltip).
import { describe, it, expect, afterEach } from 'vitest'
import { board, place, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

const sel = (h: GameHarness, id: string) => h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement)
const moveHls = (h: GameHarness) => h.container.querySelectorAll('[data-hl="hl-unitmove"]').length

// a small board of MY sites around (2,1) so a ready unit there has somewhere to step
function siteBoard(): GameState {
  const g = board(); g.prompts = []
  for (const [x, y] of [[2, 1], [2, 2], [1, 1], [3, 1]] as const) place(g, 0, 'Rustic Village', x, y)
  return g
}

describe('summoning sickness — no move/attack prompt', () => {
  it('a summoning-sick minion shows NO move highlights when selected', () => {
    const g = siteBoard()
    const id = usummon(g, 0, 'Amazon Warriors', 2, 1)
    g.units[id].tapped = false; g.units[id].enteredTurn = g.turn // entered THIS turn → summoning sick
    const h = new GameHarness(g).mount(); active = h
    sel(h, id); h.rerender()
    expect(moveHls(h), 'a summoning-sick unit offers no moves').toBe(0)
  })

  it('the SAME minion, no longer summoning-sick, DOES show move highlights', () => {
    const g = siteBoard()
    const id = usummon(g, 0, 'Amazon Warriors', 2, 1)
    g.units[id].tapped = false; g.units[id].enteredTurn = -5 // veteran → can move
    const h = new GameHarness(g).mount(); active = h
    sel(h, id); h.rerender()
    expect(moveHls(h), 'a ready unit offers moves').toBeGreaterThan(0)
  })
})

describe('same-square attack targets glow + tooltip', () => {
  it('selecting my ready minion glows a co-located enemy as an attack target', () => {
    const g = siteBoard()
    const mine = usummon(g, 0, 'Amazon Warriors', 2, 1); g.units[mine].tapped = false; g.units[mine].enteredTurn = -5
    const foe = usummon(g, 1, 'Foot Soldier', 2, 1) // same square, enemy — attackable in place
    const h = new GameHarness(g).mount(); active = h
    sel(h, mine); h.rerender()
    const foeEl = h.container.querySelector(`[data-unit="${foe}"]`) as HTMLElement
    expect(foeEl?.getAttribute('data-glow'), 'co-located enemy glows as attack target').toBe('atk')
    expect(foeEl?.getAttribute('title') ?? '', 'hover tooltip reads "⚔ Attack <name>"').toContain('Attack')
  })

  it('a summoning-sick attacker does NOT glow co-located enemies (it cannot strike)', () => {
    const g = siteBoard()
    const mine = usummon(g, 0, 'Amazon Warriors', 2, 1); g.units[mine].tapped = false; g.units[mine].enteredTurn = g.turn // summoning sick
    const foe = usummon(g, 1, 'Foot Soldier', 2, 1)
    const h = new GameHarness(g).mount(); active = h
    sel(h, mine); h.rerender()
    const foeEl = h.container.querySelector(`[data-unit="${foe}"]`) as HTMLElement
    expect(foeEl?.getAttribute('data-glow') ?? '', 'no attack glow from a sick attacker').not.toBe('atk')
  })
})
