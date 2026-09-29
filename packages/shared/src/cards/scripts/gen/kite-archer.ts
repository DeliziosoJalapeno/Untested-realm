import { registerScript } from '../registry'
import { orthAdjacentWrapped } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'

// 'Ranged / Immediately after performing a ranged strike, Kite Archer may take a step.'
registerScript('Kite Archer', {
  afterRangedStrike: (ctx, self) => {
    const from = { x: self.x, y: self.y, region: self.region }
    const squares = orthAdjacentWrapped(ctx.state, self.x, self.y).filter((s) => isLegalStep(ctx.state, self, from, { ...s, region: self.region }))
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'Kite Archer skips away — step where?', data: { squares } }, 'kite')
  },
  conts: {
    kite: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !sq || !orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === sq.x && s.y === sq.y)) return
      ctx.teleport(self.id, sq.x, sq.y, self.region)
    },
  },
})
