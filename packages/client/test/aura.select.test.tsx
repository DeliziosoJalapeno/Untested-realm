// Enchantress "animate target aura" is now picked by clicking the aura ON THE BOARD
// (a chooseTargets prompt of kind:'aura'), not a text dropdown.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function setup() {
  const g = sweepBoardBase() as any
  const me = hotseatViewpoint(g)
  const avatarId = g.players[me].avatarUnitId
  g.units[avatarId].name = 'Enchantress'; g.cards[g.units[avatarId].cardId].name = 'Enchantress'
  // an aura on the board to animate
  g.cards['acw'] = { id: 'acw', name: 'Wildfire', owner: me }
  g.auras['ra'] = { id: 'ra', cardId: 'acw', name: 'Wildfire', controller: me, squares: [{ x: 2, y: 2 }] }
  // the pending "animate which aura?" prompt, addressed to me
  g.prompts = [{
    id: 'p1', player: me, kind: 'chooseTargets',
    title: 'Enchantress: animate which aura until your next turn?',
    data: { candidates: ['ra'], count: 1, upTo: true, kind: 'aura' },
    cont: 'script:Enchantress:animate',
    ctx: { sourceId: avatarId, controller: me, targets: [] },
  }]
  return { g }
}

describe('Enchantress animates an aura by clicking it on the board', () => {
  it('the candidate aura is highlighted+clickable and clicking it animates the aura', () => {
    const { g } = setup()
    const h = new GameHarness(g).mount(); active = h

    const banner = h.container.querySelector('[data-promptbox="chooseTargets"]')
    expect(banner?.textContent, 'banner tells you to click an aura').toMatch(/click an aura/)

    // Wildfire is a SINGLE-square aura → it renders small in the artifact strip (.site-aura), not as a
    // 2x2 overlay image. It must still be selectable to answer the animate prompt.
    const pick = h.container.querySelector('.site-aura.aura-selectable') as HTMLElement
    expect(pick, 'the candidate aura is rendered as selectable').toBeTruthy()
    h.click(pick)

    // the cont ran → an animated aura minion now exists for aura 'ra'
    const minion = Object.values(g.units as any).find((u: any) => String(u.counters?.animatedAura ?? '') === 'ra')
    expect(minion, 'clicking the aura animated it').toBeTruthy()
    expect(h.drifts, 'no rejected clicks').toHaveLength(0)
  })

  it('a "skip" is offered (animating is optional)', () => {
    const { g } = setup()
    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('[data-skip="1"]'), 'skip button present').toBeTruthy()
  })

  it('a 2x2 aura is selected by its CARD, not by clicking its whole effect area', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const avatarId = g.players[me].avatarUnitId
    g.units[avatarId].name = 'Enchantress'; g.cards[g.units[avatarId].cardId].name = 'Enchantress'
    // a 2x2 aura (Blizzard) anchored at (2,2)
    g.cards['acb'] = { id: 'acb', name: 'Blizzard', owner: me }
    g.auras['rb'] = { id: 'rb', cardId: 'acb', name: 'Blizzard', controller: me, anchor: { x: 2, y: 2 }, squares: [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }] }
    g.prompts = [{ id: 'p1', player: me, kind: 'chooseTargets', title: 'Enchantress: animate which aura until your next turn?', data: { candidates: ['rb'], count: 1, upTo: true, kind: 'aura' }, cont: 'script:Enchantress:animate', ctx: { sourceId: avatarId, controller: me, targets: [] } }]
    const h = new GameHarness(g).mount(); active = h

    const box = h.container.querySelector('.overlay-item.aura.aura-selectable') as HTMLElement
    expect(box, 'the 2x2 aura box is highlighted as selectable').toBeTruthy()
    // the CARD thumbnail is the hit target; the box itself is not
    const card = box.querySelector('[data-aura-hit="rb"]') as HTMLElement
    expect(card, 'only the aura CARD is the hit target — not the whole 2x2 box').toBeTruthy()
    // clicking the CARD answers the "which aura?" prompt (routes to selectAura)
    h.click(card)
    expect(h.state.prompts.length, 'clicking the aura card selected it (prompt answered)').toBe(0)
    expect(h.drifts, 'no rejected clicks').toHaveLength(0)
  })
})
