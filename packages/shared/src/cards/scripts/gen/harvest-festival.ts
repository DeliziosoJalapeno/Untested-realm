import { registerScript } from '../registry'
import { fromCollection } from '../multi-card-utils/from-collection'

// 'Summon Eltham and Serava Townsfolk from your collection to an allied site.'
registerScript('Harvest Festival', {
  targets: [{ what: 'site', count: 1, targeted: false, owner: 'ally', label: 'an allied site' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site || site.controller !== ctx.controller) return
    fromCollection(ctx, 'Eltham Townsfolk', site.x, site.y)
    fromCollection(ctx, 'Serava Townsfolk', site.x, site.y)
  },
})
