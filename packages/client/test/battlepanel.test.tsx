// The two-sided battle panel (flow.battleReveal → data-battle-pop) must appear after a battle
// resolves, for BOTH players. Drives a real unit-vs-unit attack through the Game component.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase, usummon } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('battle panel', () => {
  it('opens after a battle resolves', () => {
    const g = sweepBoardBase()
    // attacker (p0) and an enemy target (p1) share (3,2); the attacker is un-sick
    const aid = usummon(g, 0, 'Stygian Archers', 3, 2)
    g.units[aid].region = 'surface'; g.units[aid].enteredTurn = g.turn - 2
    const tid = usummon(g, 1, 'Stygian Archers', 3, 2)
    g.units[tid].region = 'surface'
    const h = new GameHarness(g).mount(); active = h
    const root = h.container

    h.click(root.querySelector(`[data-unit="${aid}"]`) as HTMLElement); h.rerender()
    h.click(root.querySelector('[data-sq="3,2"]') as HTMLElement); h.rerender()
    const banner = root.querySelector('[data-modebanner="moveChoice"]')
    expect(banner, 'move/attack chooser').toBeTruthy()
    const attackBtn = [...banner!.querySelectorAll('[data-choice]')].find((b) => /Attack Stygian/i.test(b.textContent ?? '')) as HTMLElement
    expect(attackBtn, 'attack-the-unit option').toBeTruthy()
    h.click(attackBtn); h.rerender()
    if (h.container.querySelector('[data-promptbox="defend"]')) { /* no allied defenders → none expected */ }
    h.rerender()

    expect(g.flow.battleReveal, 'engine wrote the reveal').toBeTruthy()
    expect(root.querySelector('[data-battle-pop]'), 'battle panel is shown').toBeTruthy()
    // title + both sides present
    expect(root.querySelector('.battle-title')?.textContent).toMatch(/Battle of/i)
  })

  it('re-opens for a SECOND battle (regression: only fired once)', () => {
    const g = sweepBoardBase()
    const ensureSite = (x: number, y: number) => {
      for (const [id, s] of Object.entries(g.sites)) if ((s as any).x === x && (s as any).y === y) delete (g.sites as any)[id]
      const id = `sBR${x}${y}`
      ;(g.cards as any)[`c${id}`] = { id: `c${id}`, name: 'Rustic Village', owner: 0 }
      ;(g.sites as any)[id] = { id, cardId: `c${id}`, name: 'Rustic Village', owner: 0, controller: 0, x, y, tapped: false, isRubble: false }
    }
    ensureSite(3, 2); ensureSite(1, 2)
    // drop the scaffold's stray p1 minions so neither battle opens an (unanswered) defend window
    for (const [id, u] of Object.entries(g.units)) if ((u as any).controller === 1) delete (g.units as any)[id]
    const a1 = usummon(g, 0, 'Stygian Archers', 3, 2); g.units[a1].region = 'surface'; g.units[a1].enteredTurn = g.turn - 2
    const t1 = usummon(g, 1, 'Stygian Archers', 3, 2); g.units[t1].region = 'surface'
    const a2 = usummon(g, 0, 'Stygian Archers', 1, 2); g.units[a2].region = 'surface'; g.units[a2].enteredTurn = g.turn - 2
    const t2 = usummon(g, 1, 'Stygian Archers', 1, 2); g.units[t2].region = 'surface'
    const h = new GameHarness(g).mount(); active = h
    const root = h.container

    h.send({ t: 'moveAttack', unitId: a1, path: [], attack: { unit: t1 } }); h.rerender()
    const seq1 = g.flow.battleReveal.seq
    expect(seq1).toBeGreaterThan(0)
    expect(root.querySelector('[data-battle-pop]'), 'panel after battle 1').toBeTruthy()
    // dismiss it (as a player might) — the SECOND battle must still bring it back
    h.click(root.querySelector('[data-battle-pop]') as HTMLElement); h.rerender()
    expect(root.querySelector('[data-battle-pop]'), 'dismissed').toBeFalsy()

    h.send({ t: 'moveAttack', unitId: a2, path: [], attack: { unit: t2 } }); h.rerender()
    const seq2 = g.flow.battleReveal.seq
    expect(seq2, 'engine bumped seq for battle 2').toBeGreaterThan(seq1)
    expect(root.querySelector('[data-battle-pop]'), 'panel RE-OPENS for battle 2').toBeTruthy()
  })
})
