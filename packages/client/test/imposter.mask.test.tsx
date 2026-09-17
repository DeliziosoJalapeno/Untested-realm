// A masked Imposter wears another Avatar's face: its board chip shows THAT avatar's art
// (not the Imposter's own), with a 🎭 badge where the Airborne icon usually sits.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

const MASK = 'Sparkmage' // any real Avatar name

describe('masked Imposter shows the donned avatar art + a mask badge', () => {
  it('renders the mask avatar art and a "Masked as …" 🎭 badge on the Imposter chip', () => {
    const g = sweepBoardBase() as any
    const av = g.units[g.players[0].avatarUnitId]
    av.name = 'Imposter'; g.cards[av.cardId].name = 'Imposter'
    g.flow = { ...(g.flow ?? {}), imposterMask: { 0: MASK } }

    const h = new GameHarness(g).mount(); active = h
    const chip = h.container.querySelector('.unit.mine.avatar') as HTMLElement
    expect(chip, 'the player-0 Imposter avatar chip is on the board').toBeTruthy()
    expect(chip.getAttribute('data-unitname'), 'the unit is still the Imposter under the mask').toBe('Imposter')

    // the art element carries the MASK name, not "Imposter"
    const art = chip.querySelector('.unitimg') as HTMLElement
    const shown = art.getAttribute('alt') ?? art.textContent ?? ''
    expect(shown, 'art shows the donned avatar, not the Imposter').toContain(MASK)
    expect(shown).not.toContain('Imposter')

    // the mask badge is present (in the Airborne icon's slot)
    const badge = chip.querySelector('[title^="Masked as"]') as HTMLElement
    expect(badge, 'a 🎭 mask badge is shown').toBeTruthy()
    expect(badge.getAttribute('title')).toBe(`Masked as ${MASK}`)
  })

  it('an UNmasked Imposter shows its own art and no badge', () => {
    const g = sweepBoardBase() as any
    const av = g.units[g.players[0].avatarUnitId]
    av.name = 'Imposter'; g.cards[av.cardId].name = 'Imposter'
    // no imposterMask set

    const h = new GameHarness(g).mount(); active = h
    const chip = h.container.querySelector('.unit.mine.avatar') as HTMLElement
    const art = chip.querySelector('.unitimg') as HTMLElement
    const shown = art.getAttribute('alt') ?? art.textContent ?? ''
    expect(shown, 'unmasked → own art').toContain('Imposter')
    expect(chip.querySelector('[title^="Masked as"]'), 'no badge when unmasked').toBeFalsy()
  })
})
