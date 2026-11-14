import { registerScript } from '../registry'
import { isDisabled, regionPresentAt } from '../../../engine/statics'
import { GRID_H, GRID_W, edgesConnected, inBounds } from '../../../engine/grid'
import { siteEntryAllowed } from '../../../engine/movement'
import type { GameState, Step, UnitState } from '../../../engine/types'

// 'Slide an ally or disabled enemy as far as possible in a cardinal direction. Draw a spell.'
// Sliding is forced movement: the unit stays in its region (FAQ: it can't be pushed into the void) and
// stops at the edge of that region or before a site it may not enter.
const DIRS: Record<string, { dx: number; dy: number }> = { n: { dx: 0, dy: 1 }, s: { dx: 0, dy: -1 }, e: { dx: 1, dy: 0 }, w: { dx: -1, dy: 0 } }

function slideEnd(state: GameState, unit: UnitState, dir: string): Step {
  const d = DIRS[dir]
  let cur: Step = { x: unit.x, y: unit.y, region: unit.region }
  const seen = new Set([`${cur.x},${cur.y}`])
  for (;;) {
    let x = cur.x + d.dx
    let y = cur.y + d.dy
    if (!inBounds(x, y)) {
      if (!edgesConnected(state)) break
      x = (x + GRID_W) % GRID_W
      y = (y + GRID_H) % GRID_H
    }
    if (seen.has(`${x},${y}`) || !regionPresentAt(state, unit.region, x, y)) break
    const next: Step = { x, y, region: unit.region }
    if (unit.region === 'surface' && !siteEntryAllowed(state, unit, cur, next)) break
    seen.add(`${x},${y}`)
    cur = next
  }
  return cur
}

registerScript('Slide', {
  targets: [{
    what: 'unit', count: 1, targeted: false, label: 'an ally or a disabled enemy',
    filter: (state, cand, source) => cand.controller === source.controller || (!cand.isAvatar && isDisabled(state, cand)),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t) || !ctx.state.units[t.unit]) return void ctx.draw(ctx.controller, 'spellbook')
    ctx.ask({ kind: 'chooseOption', title: `Slide ${ctx.state.units[t.unit].name} in which direction?`, data: { options: ['n', 's', 'e', 'w'] } }, 'slide', { unitId: t.unit })
  },
  conts: {
    slide: (ctx, c, dir) => {
      const u = ctx.state.units[c.unitId as string]
      if (u && typeof dir === 'string' && DIRS[dir]) {
        const end = slideEnd(ctx.state, u, dir)
        if (end.x !== u.x || end.y !== u.y) ctx.teleport(u.id, end.x, end.y, u.region, { push: true })
        else ctx.log(`${u.name} has nowhere to slide.`)
      }
      ctx.draw(ctx.controller, 'spellbook')
    },
  },
})
