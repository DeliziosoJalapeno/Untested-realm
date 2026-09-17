import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isWaterSite, unitsAt } from '../../../engine/grid'
import { checkStateBased } from '../../../engine/effects'

// 'Surface everything at target water site and summon two Skeleton tokens there.'
registerScript('Dredge', {
  targets: [{
    what: 'site', count: 1, targeted: true, label: 'target water site',
    filter: (state, site) => isWaterSite(state, site, getCard),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site) return
    for (const u of unitsAt(ctx.state, site.x, site.y, 'underwater')) u.region = 'surface'
    for (const a of Object.values(ctx.state.artifacts)) {
      if (a.x === site.x && a.y === site.y && a.region === 'underwater') a.region = 'surface'
    }
    ctx.summonToken('Skeleton', ctx.controller, site.x, site.y)
    ctx.summonToken('Skeleton', ctx.controller, site.x, site.y)
    checkStateBased(ctx.state)
  },
})
