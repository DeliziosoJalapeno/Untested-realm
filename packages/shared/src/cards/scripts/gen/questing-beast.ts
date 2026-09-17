import { registerScript } from '../registry'
import { inBounds } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'

// 'At the end of your turn, Questing Beast may take a step.'
registerScript('Questing Beast', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const from = { x: self.x, y: self.y, region: self.region }
    const squares = [
      { x: self.x + 1, y: self.y }, { x: self.x - 1, y: self.y },
      { x: self.x, y: self.y + 1 }, { x: self.x, y: self.y - 1 },
    ].filter((s) => inBounds(s.x, s.y) && isLegalStep(ctx.state, self, from, { ...s, region: self.region }))
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'The Questing Beast slips away — step where? (its square to stay)', data: { squares: [...squares, { x: self.x, y: self.y }] } }, 'quest')
  },
  conts: {
    quest: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !sq || (sq.x === self.x && sq.y === self.y)) return
      if (Math.abs(sq.x - self.x) + Math.abs(sq.y - self.y) !== 1) return
      ctx.teleport(self.id, sq.x, sq.y, self.region)
    },
  },
})
