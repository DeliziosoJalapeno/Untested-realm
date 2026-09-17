import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'

// '(W)(W)(W) — Genesis → Summon three submerged Frog tokens here.'
registerScript('Tadpole Pool', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    let water = 0
    for (const s of Object.values(ctx.state.sites)) {
      if (s.controller === ctx.controller && !s.isRubble) water += getCard(s.name).thresholds.water
    }
    if (water < 3) return
    for (let i = 0; i < 3; i++) ctx.summonToken('Frog', ctx.controller, self.x, self.y, 'underwater')
    pushLog(ctx.state, ctx.controller, 'The pool teems with pond life.')
  },
})
