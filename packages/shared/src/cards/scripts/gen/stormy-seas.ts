import { registerScript } from '../registry'
import { getCard } from '../../db'
import { checkStateBased, trySubmerge } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'Submerge all minions and artifacts occupying target water site.'
registerScript('Stormy Seas', {
  targets: [{
    what: 'site', count: 1, targeted: true, label: 'target water site',
    filter: (state, s) => s.flooded || getCard(s.name).thresholds.water > 0,
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site) return
    for (const u of unitsAt(ctx.state, site.x, site.y, 'surface')) {
      trySubmerge(ctx.state, u)
    }
    for (const a of Object.values(ctx.state.artifacts)) {
      if (!a.carriedBy && a.x === site.x && a.y === site.y && a.region === 'surface') a.region = 'underwater'
    }
    checkStateBased(ctx.state)
  },
})
