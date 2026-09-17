import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isWaterSite, unitsAt } from '../../../engine/grid'
import { stepDistance } from '../../../engine/movement'

// 'Destroy all minions occupying target water site up to two steps away.'
registerScript('Boil', {
  targets: [{
    what: 'site', count: 1, targeted: true, label: 'target water site (â‰¤2 steps)',
    filter: (state, site) => isWaterSite(state, site, getCard),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('site' in t)) return
    const site = ctx.state.sites[t.site]
    const caster = ctx.caster!
    if (!site || stepDistance(caster, site) > 2) return ctx.log('Too far away.') // "up to two steps away" (def. 1)
    for (const u of unitsAt(ctx.state, site.x, site.y)) {
      if (!u.isAvatar && (u.region === 'surface' || u.region === 'underwater')) ctx.kill(u.id)
    }
  },
})
