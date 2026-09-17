import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import { checkStateBased, applyFlood } from '../../../engine/effects'

// 'Affected sites are flooded. They're water sites.' (2x2 aura)
registerScript('Flood', {
  genesis: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    for (const sq of aura.squares) {
      const site = siteAt(ctx.state, sq.x, sq.y)
      if (site && !site.isRubble) applyFlood(ctx.state, site, ctx.controller)
    }
    checkStateBased(ctx.state)
  },
})
