import { registerScript } from '../registry'
import { drawLocked } from '../multi-card-utils/draw-locked'

// 'Spellcaster / Genesis → Draws his own spell, which only he can cast.'
registerScript('Runeling', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self) drawLocked(ctx, self.id, 'the Runeling')
  },
})
