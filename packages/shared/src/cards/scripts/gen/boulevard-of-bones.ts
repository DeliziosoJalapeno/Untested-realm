import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Whenever another site is played to an adjacent square, summon a Skeleton token there.'
registerScript('Boulevard of Bones', {
  onSitePlayed: (ctx, _by, site) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || site.id === self.id) return
    if (Math.abs(site.x - self.x) + Math.abs(site.y - self.y) !== 1) return
    // the summon can be forbidden at the target site (No Man's Land) — only crow about it if one rose
    if (ctx.summonToken('Skeleton', ctx.controller, site.x, site.y)) {
      pushLog(ctx.state, ctx.controller, 'Bones rattle up from beneath the boulevard.')
    }
  },
})
