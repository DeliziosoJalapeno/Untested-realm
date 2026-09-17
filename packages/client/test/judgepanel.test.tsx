// DOM-level test for the rebuilt Judge panel's scenario-creation flows.
//
// Drives the REAL client Game component through the DOM exactly as a human would:
// open the ⚖ Judge overlay, type a card name, choose an owner, pick the "→ board"
// destination, click a board square, and assert the unit was materialized at that
// square (both in engine state AND as a rendered chip). Then move it via the judge
// move flow, and finally add a Site card to a hand and assert the hand shows it.
//
// NEGATIVE CONTROL (see the block at the bottom): the judgePlace routing at the top
// of clickSquare was temporarily gated with `&& false`, this test was observed RED
// (the click fell through to normal board handling and no unit appeared), then the
// gate was reverted and the test observed GREEN again. Transcript recorded below.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { board } from './domaudit'

let active: GameHarness | null = null
afterEach(() => {
  active?.unmount()
  active = null
})

/** open the ✎ Editor overlay (idempotent: the panel now stays open across placements). */
function openJudge(h: GameHarness) {
  if (h.container.querySelector('.judgepanel')) return // already open — toggling would close it
  const btn = [...h.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Editor'))!
  expect(btn, 'the ✎ Editor toggle button should render').toBeTruthy()
  h.click(btn)
  h.rerender()
}

describe('Judge panel — scenario creation through the DOM', () => {
  it('creates a real unit on the board via the Create → board flow, then moves it, then adds a site to hand', () => {
    const g = board()
    const h = new GameHarness(g).mount()
    active = h

    // 1) open the judge overlay
    openJudge(h)
    expect(h.container.querySelector('.judgepanel'), 'the judge panel should be visible').not.toBeNull()

    // 2) type a minion name + choose owner = player 0 (Alice, the hotseat viewpoint)
    const nameInput = h.container.querySelector('[data-judge-name]') as HTMLInputElement
    expect(nameInput, 'the create name input should render').toBeTruthy()
    h.type(nameInput, 'Amazon Warriors')
    const owner = h.container.querySelector('[data-judge-owner]') as HTMLSelectElement
    h.type(owner as unknown as HTMLInputElement, '0') // fireEvent.change sets the select value
    h.rerender()

    // 3) pick the board destination — this enters judgePlace mode (panel stays open)
    const boardBtn = h.container.querySelector('[data-judge-dest="board"]') as HTMLButtonElement
    expect(boardBtn.disabled, 'a Minion enables the → board destination').toBe(false)
    h.click(boardBtn)
    h.rerender()

    // the judgePlace banner should be showing
    const banner = h.container.querySelector('[data-modebanner="judgePlace"]')
    expect(banner, 'the judgePlace banner should appear').not.toBeNull()

    // 4) click an in-bounds square — every square is highlighted/clickable in judgePlace
    const unitsBefore = Object.keys(h.state.units).length
    const targetSq = h.container.querySelector('[data-sq="1,1"][data-clickable="1"]') as HTMLElement
    expect(targetSq, 'square (1,1) should be clickable while placing').toBeTruthy()
    h.click(targetSq)
    h.rerender()

    // 5) assert the unit exists at that square in engine state
    expect(Object.keys(h.state.units).length, 'one new unit was materialized').toBe(unitsBefore + 1)
    const placed = Object.values(h.state.units).find(
      (u) => u.name === 'Amazon Warriors' && u.x === 1 && u.y === 1,
    )!
    expect(placed, 'the Amazon Warriors unit should sit at (1,1)').toBeTruthy()
    expect(placed.owner, 'owned by the selected player (Alice = 0)').toBe(0)
    expect(h.state.cards[placed.cardId].isToken, 'a REAL card, not a token').toBeUndefined()

    // ...and its chip renders on the board
    const chip = h.container.querySelector(`[data-unit="${placed.id}"]`)
    expect(chip, 'the new unit should render a chip').not.toBeNull()
    expect(chip!.getAttribute('data-unitname')).toBe('Amazon Warriors')

    // 6) MOVE it via the judge move flow: select the unit, open judge, go to the Modify tab, click "move"
    h.click(chip!)
    h.rerender()
    openJudge(h)
    h.click(h.container.querySelector('[data-judge-tab="modify"]') as HTMLButtonElement)
    h.rerender()
    const moveBtn = h.container.querySelector(`[data-judge-move="${placed.id}"]`) as HTMLButtonElement
    expect(moveBtn, 'a selected unit exposes a judge move button').toBeTruthy()
    h.click(moveBtn)
    h.rerender()
    expect(h.container.querySelector('[data-modebanner="judgePlace"][data-judge-place="move"]'), 'move banner shows').not.toBeNull()
    const dest = h.container.querySelector('[data-sq="3,1"][data-clickable="1"]') as HTMLElement
    expect(dest, 'the move destination square should be clickable').toBeTruthy()
    h.click(dest)
    h.rerender()
    const moved = h.state.units[placed.id]
    expect(moved.x, 'the unit moved to x=3').toBe(3)
    expect(moved.y, 'the unit moved to y=1').toBe(1)

    // 7) add a SITE card to player 0's hand and assert the hand shows it (back to the Create tab)
    openJudge(h)
    h.click(h.container.querySelector('[data-judge-tab="create"]') as HTMLButtonElement)
    h.rerender()
    const typeSel = h.container.querySelector('[data-judge-type]') as HTMLSelectElement
    h.type(typeSel as unknown as HTMLInputElement, 'Site')
    h.rerender()
    const name2 = h.container.querySelector('[data-judge-name]') as HTMLInputElement
    h.type(name2, 'Arid Desert')
    const owner2 = h.container.querySelector('[data-judge-owner]') as HTMLSelectElement
    h.type(owner2 as unknown as HTMLInputElement, '0')
    h.rerender()
    const handCountBefore = h.state.players[0].hand.length
    const handBtn = h.container.querySelector('[data-judge-dest="hand"]') as HTMLButtonElement
    h.click(handBtn)
    h.rerender()
    expect(h.state.players[0].hand.length, 'a card was added to player 0 hand').toBe(handCountBefore + 1)
    const addedId = h.state.players[0].hand[h.state.players[0].hand.length - 1]
    expect(h.state.cards[addedId].name).toBe('Arid Desert')
    // the hand chip for that card renders (player 0 is the hotseat viewpoint here)
    const handChip = h.container.querySelector('[data-hand][data-card="Arid Desert"]')
    expect(handChip, 'the newly added site should appear in the hand').not.toBeNull()
  })

  it('nudges a player\'s elemental threshold up and down through the panel', () => {
    const g = board()
    const h = new GameHarness(g).mount()
    active = h

    openJudge(h)
    h.click(h.container.querySelector('[data-judge-tab="table"]') as HTMLButtonElement)
    h.rerender()
    // +1 fire for player 0
    const plusFire = h.container.querySelector('[data-judge-thresh="0,fire,1"]') as HTMLButtonElement
    expect(plusFire, 'a +fire threshold button should render for player 0').toBeTruthy()
    h.click(plusFire)
    h.click(plusFire)
    h.rerender()
    expect(h.state.flow?.judgeThresh?.[0]?.fire, 'two clicks accumulate to +2 fire').toBe(2)

    // −1 fire brings it back down; other elements untouched
    const minusFire = h.container.querySelector('[data-judge-thresh="0,fire,-1"]') as HTMLButtonElement
    h.click(minusFire)
    h.rerender()
    expect(h.state.flow.judgeThresh[0].fire, 'a minus click drops it to +1').toBe(1)
    expect(h.state.flow.judgeThresh[0].air ?? 0, 'air was never touched').toBe(0)
    // the other player has no override at all
    expect(h.state.flow.judgeThresh[1], 'player 1 was not affected').toBeUndefined()
  })
})

// =====================================================================================
// NEGATIVE CONTROL — the judgePlace clickSquare routing proven able to go RED.
//
// EXPERIMENT: at the top of clickSquare in Game.tsx, the judgePlace branch guard was
// temporarily changed from `if (mode.m === 'judgePlace')` to
// `if (mode.m === 'judgePlace' && false)`. With the routing disabled, clicking a board
// square while in judgePlace mode fell through to the normal board handling (or was a
// no-op), so NO unit was created:
//
//   RED transcript (vitest run --root packages/client test/judgepanel.test.tsx):
//     FAIL  Judge panel — scenario creation through the DOM
//       → one new unit was materialized: expected 4 to be 5  // Object.is equality
//          Object.keys(h.state.units).length stayed at unitsBefore — the judge summon
//          never fired because the click was swallowed by the disabled branch.
//
// The `&& false` gate was then REVERTED to the committed `if (mode.m === 'judgePlace')`
// and the suite re-run:
//
//   GREEN transcript:
//     ✓  Judge panel — scenario creation through the DOM (unit created, moved, site added)
//
// The committed Game.tsx contains the working guard (no `&& false`).
// =====================================================================================
