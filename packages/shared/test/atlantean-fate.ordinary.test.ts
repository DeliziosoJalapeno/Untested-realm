// Atlantean Fate only AFFECTS non-Ordinary sites ("affected non-Ordinary sites … lose all other
// abilities"). An Ordinary site in its area is untouched — not silenced (and rubble, being Ordinary,
// is spared too).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { siteSilenced, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Atlantean Fate silences only non-Ordinary sites', () => {
  it('silences a non-Ordinary site but leaves an Ordinary one alone', () => {
    const g = newGame() as GameState; keepBoth(g)
    const elite = placeSite(g, 0, 'Battlefield', 1, 1)       // Elite → affected
    const ordinary = placeSite(g, 0, 'Rustic Village', 2, 1) // Ordinary → untouched
    const aura = { id: 'raf', cardId: 'caf', name: 'Atlantean Fate', controller: 0, squares: [{ x: 1, y: 1 }, { x: 2, y: 1 }] } as any
    g.auras[aura.id] = aura

    expect(siteSilenced(g, elite), 'the non-Ordinary site is silenced').toBe(true)
    expect(siteSilenced(g, ordinary), 'the Ordinary site is NOT silenced').toBe(false)
  })

  it('does not silence rubble (rubble is Ordinary)', () => {
    const g = newGame() as GameState; keepBoth(g)
    const rubble = placeSite(g, 0, 'Battlefield', 1, 1); rubble.isRubble = true // once-Elite, now Ordinary rubble
    const aura = { id: 'raf', cardId: 'caf', name: 'Atlantean Fate', controller: 0, squares: [{ x: 1, y: 1 }] } as any
    g.auras[aura.id] = aura
    expect(siteSilenced(g, rubble), 'rubble reads Ordinary → not affected').toBe(false)
  })
})
