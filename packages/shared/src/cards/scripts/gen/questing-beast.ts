import { registerScript } from '../registry'
import { orthAdjacentWrapped } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'

// 'At the end of your turn, Questing Beast may take a step.'
registerScript('Questing Beast', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const from = { x: self.x, y: self.y, region: self.region }
    const squares = orthAdjacentWrapped(ctx.state, self.x, self.y).filter((s) => isLegalStep(ctx.state, self, from, { ...s, region: self.region }))
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'The Questing Beast slips away — step where? (its square to stay)', data: { squares: [...squares, { x: self.x, y: self.y }] } }, 'quest')
  },
  conts: {
    quest: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !sq || (sq.x === self.x && sq.y === self.y)) return
      if (!orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === sq.x && s.y === sq.y)) return
      ctx.teleport(self.id, sq.x, sq.y, self.region)
    },
  },
})
