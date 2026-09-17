// Displace targets "minion, artifact, or aura". This checks the client half of the aura path: casting
// Displace highlights an aura on the board as a legal target, and clicking it picks the aura (the cast
// goes through, opening the diagonal-destination prompt).
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { inject as cinject, sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Displace can target an aura on the board', () => {
  it('highlights the aura and picking it casts onto it', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    // a 1x1 aura (Wildfire) at (2,2) controlled by the viewer
    g.cards['acw'] = { id: 'acw', name: 'Wildfire', owner: me }
    g.auras['rwf'] = { id: 'rwf', cardId: 'acw', name: 'Wildfire', controller: me, squares: [{ x: 2, y: 2 }] }
    cinject(g, me, 'Displace')

    const h = new GameHarness(g).mount(); active = h
    const root = h.container

    // enter magic-target mode by clicking the Displace card in hand
    h.click(root.querySelector('[data-hand][data-card="Displace"]') as HTMLElement); h.rerender()

    // the aura is highlighted as a legal target (1x1 → small card in the site strip)
    const pick = root.querySelector('.site-aura.aura-selectable') as HTMLElement
    expect(pick, 'the aura is offered as a Displace target').toBeTruthy()

    const drift0 = h.drifts.length
    h.click(pick); h.rerender()

    // the aura was accepted as the target → we left magic mode (the cast was sent). No rejected clicks.
    expect(h.drifts.length, 'no engine drift — the aura was a legal target').toBe(drift0)
    expect(root.querySelector('[data-modebanner="magic"]'), 'left magic mode after picking the aura').toBeNull()
  })
})
