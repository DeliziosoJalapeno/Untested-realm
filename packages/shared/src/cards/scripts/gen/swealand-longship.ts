import { registerScript } from '../registry'
import { terrainAt } from '../../../engine/statics'
import { orthAdjacentWrapped } from '../../../engine/grid'
import { takeOwnStep } from '../../../engine/movement'
import { ownSteps } from '../multi-card-utils/own-step'
import type { GameState, Step, UnitState } from '../../../engine/types'

// 'Once on your turn, may move to an adjacent water site.'
// A free move of its own, on top of its normal movement and without tapping: one step it could legally
// take, onto the surface of an orthogonally adjacent water site.
const harbours = (state: GameState, ship: UnitState): Step[] => {
  const beside = orthAdjacentWrapped(state, ship.x, ship.y)
  return ownSteps(state, ship).filter((s) => s.region === 'surface'
    && beside.some((q) => q.x === s.x && q.y === s.y) && terrainAt(state, s.x, s.y) === 'water')
}

registerScript('Swealand Longship', {
  abilities: [{
    key: 'sail',
    label: 'Move to an adjacent water site (once on your turn)',
    cost: {},
    oncePerTurn: true,
    available: (state, sourceId) => { const u = state.units[sourceId]; return !!u && harbours(state, u).length > 0 },
    effect: (ctx) => {
      const ship = ctx.state.units[ctx.sourceId]
      if (!ship) return
      ctx.ask({ kind: 'chooseSquare', title: 'Sail to which adjacent water site?', data: { squares: harbours(ctx.state, ship).map((s) => ({ x: s.x, y: s.y })) } }, 'sail')
    },
  }],
  conts: {
    sail: (ctx, _c, sq) => {
      const ship = ctx.state.units[ctx.sourceId]
      if (!ship || !sq || typeof sq.x !== 'number') return
      const to = harbours(ctx.state, ship).find((s) => s.x === sq.x && s.y === sq.y)
      if (to) takeOwnStep(ctx.state, ship, to)
    },
  },
})
