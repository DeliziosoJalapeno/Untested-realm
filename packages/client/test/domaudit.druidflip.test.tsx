// The double-faced Druid must swap its BOARD art when it flips: front face while
// unflipped, back/flip-side face (art by Bryon Wackwitz) once `unit.flipped` is set.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'
import { avatarOf } from '@sorcery/shared'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Druid flip — the board art swaps to the back face when flipped', () => {
  it('renders the front art while unflipped and the back art once flipped', () => {
    const g = sweepBoardBase()
    const av = avatarOf(g, 0); av.name = 'Druid'

    let h = new GameHarness(g).mount(); active = h
    const frontImg = h.container.querySelector(`[data-unit="${av.id}"] img.unitimg`) as HTMLImageElement
    expect(frontImg, 'the Druid avatar renders an image').toBeTruthy()
    expect(frontImg.getAttribute('src')).toBe('/cards/004-druid-bt-s.webp')
    h.unmount(); active = null

    av.flipped = true
    h = new GameHarness(g).mount(); active = h
    const backImg = h.container.querySelector(`[data-unit="${av.id}"] img.unitimg`) as HTMLImageElement
    expect(backImg.getAttribute('src'), 'the flip-side art is shown').toBe('/cards/004-druid-bt-s-back.webp')
  })
})
