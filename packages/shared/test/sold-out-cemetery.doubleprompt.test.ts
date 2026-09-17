// Sold-out Cemetery ("Whenever Undead enter this site, push another Undead here away one step").
// A single continuous move that ENTERS the site more than once (a revisit / loop path) fires the
// eviction once per entry; because every queued eviction captures the same resident Undead before
// any resolves, the same creature used to be pushed — and prompted for its direction — twice. It
// must now be evicted only ONCE (the later, stale eviction is a no-op once it has already left).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { applyAction, type GameState, type UnitState } from '../src'
import '../src/cards/scripts/index'

function resolveAll(g: GameState): string[] {
  const seen: string[] = []
  let guard = 0
  while (g.prompts.length && guard++ < 30) {
    const p = g.prompts[0]
    seen.push(String(p.title))
    const choice =
      p.kind === 'chooseTargets' ? [(p.data as any).candidates[0]]
      : p.kind === 'chooseSquare' ? (p.data as any).squares[0]
      : (p.data as any).options?.[0] ?? null
    const res = applyAction(g, p.player, { t: 'prompt', promptId: p.id, choice })
    if (!res.ok) { seen.push(`ERR:${res.error}`); break }
  }
  return seen
}

function board(): { g: GameState; A: UnitState; B: UnitState } {
  const g = newGame(); keepBoth(g); g.turn = 3
  // a plus of sites so the resident Undead has several exits (which forces a direction prompt)
  for (const [x, y] of [[0, 1], [1, 1], [2, 1], [1, 0], [1, 2]] as const) {
    placeSite(g, 0, x === 1 && y === 1 ? 'Sold-out Cemetery' : 'Spire', x, y)
  }
  const B = summonCard(g, 0, 'Bone Jumble', 1, 1); B.enteredTurn = -5 // resident Undead
  const A = summonCard(g, 0, 'Bone Jumble', 0, 1); A.enteredTurn = -5
  A.modifiers.push({ kind: 'keyword', keyword: 'movement +1', duration: 'permanent', turn: 0, sourcePlayer: 0 } as any)
  A.modifiers.push({ kind: 'keyword', keyword: 'movement +1', duration: 'permanent', turn: 0, sourcePlayer: 0 } as any) // +2 → 3 steps
  return { g, A, B }
}

describe('Sold-out Cemetery does not double-evict on a revisiting move', () => {
  it('a move that enters the site twice pushes the resident Undead only once', () => {
    const { g, A, B } = board()
    // (0,1) → (1,1)=cemetery → (1,0) → (1,1)=cemetery : the site is entered on two separate steps
    const res = applyAction(g, 0, { t: 'moveAttack', unitId: A.id, path: [
      { x: 1, y: 1, region: 'surface' }, { x: 1, y: 0, region: 'surface' }, { x: 1, y: 1, region: 'surface' },
    ] })
    expect(res.ok).toBe(true)
    const seen = resolveAll(g)
    // only ONE "shambles out — which way?" (direction) prompt for the evicted creature
    expect(seen.filter((t) => /shambles/i.test(t)), `direction prompted once, not twice: ${JSON.stringify(seen)}`).toHaveLength(1)
    // and B actually left the cemetery (pushed exactly one step, not shoved twice)
    const after = g.units[B.id]
    expect(after.x === 1 && after.y === 1, 'B was pushed off the cemetery').toBe(false)
    const dist = Math.abs(after.x - 1) + Math.abs(after.y - 1)
    expect(dist, 'B moved exactly one step (not two)').toBe(1)
  })

  it('a normal single entry still evicts once (trigger intact)', () => {
    const { g, A } = board()
    const res = applyAction(g, 0, { t: 'moveAttack', unitId: A.id, path: [{ x: 1, y: 1, region: 'surface' }] })
    expect(res.ok).toBe(true)
    const seen = resolveAll(g)
    expect(seen.filter((t) => /shambles/i.test(t))).toHaveLength(1)
  })

  // Regression: the eviction must fire for EACH distinct Undead that enters — never suppressed per
  // mover. Army of the Dead drops a Skeleton at each square it leaves; a Skeleton dropped onto the
  // cemetery is a fresh Undead entering, so it must still push the resident out.
  it('a Skeleton dropped on the cemetery by Army of the Dead still evicts the resident', () => {
    const g = newGame(); keepBoth(g); g.turn = 3
    for (const [x, y] of [[0, 1], [1, 1], [2, 1], [1, 0], [1, 2]] as const) {
      placeSite(g, 0, x === 1 && y === 1 ? 'Sold-out Cemetery' : 'Spire', x, y)
    }
    const B = summonCard(g, 0, 'Bone Jumble', 1, 1); B.enteredTurn = -5 // resident Undead
    const army = summonCard(g, 0, 'Army of the Dead', 1, 1); army.enteredTurn = -5
    applyAction(g, 0, { t: 'moveAttack', unitId: army.id, path: [{ x: 2, y: 1, region: 'surface' }] })
    const seen = resolveAll(g)
    expect(seen.some((t) => /vacancy/i.test(t)), 'the dropped Skeleton triggers an eviction').toBe(true)
    expect(g.units[B.id].x === 1 && g.units[B.id].y === 1, 'the resident was pushed off the cemetery').toBe(false)
  })
})
