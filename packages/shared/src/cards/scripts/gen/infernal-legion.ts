import { registerScript } from '../registry'
import { adjacentSquaresW, unitsAt } from '../../../engine/grid'

// 'At the end of your turn, deal 3 damage to each other adjacent unit.'
registerScript('Infernal Legion', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    for (const sq of adjacentSquaresW(ctx.state, self.x, self.y)) {
      for (const u of unitsAt(ctx.state, sq.x, sq.y, self.region)) {
        if (u.id !== self.id) ctx.dealDamage({ unit: u.id }, 3)
      }
    }
  },
})
