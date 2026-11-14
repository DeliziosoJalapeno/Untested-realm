import { registerScript } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'

// 'Whenever the Slug leaves a site, it deals 2 damage to units there.'
// It fires once the Slug has entered its new location (FAQ), so the Slug itself is never caught. Moving
// between a site's own levels is not leaving it.
registerScript('Slag Slug', {
  onUnitEntersSquare: (ctx, moved, from) => {
    if (moved.id !== ctx.sourceId) return
    if (from.region === 'void' || (from.x === moved.x && from.y === moved.y)) return
    if (from.x < 0 || !siteAt(ctx.state, from.x, from.y)) return
    const there = unitsAt(ctx.state, from.x, from.y).filter((u) => u.region !== 'void' && u.id !== moved.id)
    if (!there.length) return
    ctx.log('The Slag Slug leaves a searing trail.')
    for (const u of there) if (ctx.state.units[u.id]) ctx.dealDamage({ unit: u.id }, 2)
  },
})
