// A Monument (ground artifact, e.g. Makeshift Barricade) glows its controller's colour like a minion chip:
// blue (mono-mine) when you control it, red (mono-theirs) when the opponent does.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { board } from './domaudit'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function monument(g: any, conjuredBy: number, x: number, y: number, id: string) {
  const cid = `c${id}`; g.cards[cid] = { id: cid, name: 'Makeshift Barricade', owner: conjuredBy }
  g.artifacts[id] = { id, cardId: cid, name: 'Makeshift Barricade', conjuredBy, x, y, region: 'surface', carriedBy: null, tapped: false }
}

describe('Monument border tracks its controller', () => {
  it('shows mono-mine for my monument and mono-theirs for the opponent’s', () => {
    const g: any = board(); g.prompts = []; g.phase = 'main'; g.activePlayer = 0
    monument(g, 0, 1, 1, 'mineArt')  // player 0 (me) controls it — on my site (1,1)
    monument(g, 1, 2, 2, 'oppArt')   // player 1 controls it — on their site (2,2)

    const h = new GameHarness(g).mount(); active = h
    const mine = h.container.querySelector('[data-artifact="mineArt"]')
    const opp = h.container.querySelector('[data-artifact="oppArt"]')
    expect(mine?.classList.contains('mono-mine'), 'my monument glows my colour').toBe(true)
    expect(opp?.classList.contains('mono-theirs'), 'the opponent’s monument glows theirs').toBe(true)
  })

  it('flips colour when control changes', () => {
    const g: any = board(); g.prompts = []; g.phase = 'main'; g.activePlayer = 0
    monument(g, 0, 1, 1, 'flipArt')
    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('[data-artifact="flipArt"]')?.classList.contains('mono-mine')).toBe(true)
    // hand it to the opponent and re-render
    g.artifacts['flipArt'].conjuredBy = 1
    h.rerender()
    const el = h.container.querySelector('[data-artifact="flipArt"]')
    expect(el?.classList.contains('mono-theirs'), 'now the opponent’s colour').toBe(true)
    expect(el?.classList.contains('mono-mine'), 'no longer mine').toBe(false)
  })
})
