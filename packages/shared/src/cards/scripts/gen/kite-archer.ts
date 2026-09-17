import { registerScript } from '../registry'
import { inBounds } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'

// 'Ranged / Immediately after performing a ranged strike, Kite Archer may take a step.'
registerScript('Kite Archer', {
  afterRangedStrike: (ctx, self) => {
    const from = { x: self.x, y: self.y, region: self.region }
    const squares = [
      { x: self.x + 1, y: self.y }, { x: self.x - 1, y: self.y },
      { x: self.x, y: self.y + 1 }, { x: self.x, y: self.y - 1 },
    ].filter((s) => inBounds(s.x, s.y) && isLegalStep(ctx.state, self, from, { ...s, region: self.region }))
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'Kite Archer skips away — step where?', data: { squares } }, 'kite')
  },
  conts: {
    kite: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !sq || Math.abs(sq.x - self.x) + Math.abs(sq.y - self.y) !== 1) return
      ctx.teleport(self.id, sq.x, sq.y, self.region)
    },
  },
})
