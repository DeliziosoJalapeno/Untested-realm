import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// 'Summon a Skeleton token to each allied site that borders an enemy site.'
registerScript('Raise Militia', {
  onCast: (ctx) => {
    for (const site of Object.values(ctx.state.sites)) {
      if (site.controller !== ctx.controller || site.isRubble) continue
      const borders = [{ x: site.x + 1, y: site.y }, { x: site.x - 1, y: site.y }, { x: site.x, y: site.y + 1 }, { x: site.x, y: site.y - 1 }]
        .some((s) => {
          const o = siteAt(ctx.state, s.x, s.y)
          return o && o.controller !== null && o.controller !== ctx.controller && !o.isRubble
        })
      if (borders) ctx.summonToken('Skeleton', ctx.controller, site.x, site.y)
    }
  },
})
