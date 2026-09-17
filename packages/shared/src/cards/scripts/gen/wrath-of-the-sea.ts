import { registerScript } from '../registry'
import { getCard } from '../../db'
import { checkStateBased, trySubmerge, applyFlood } from '../../../engine/effects'
import { orthAdjacentWrapped, siteAt } from '../../../engine/grid'

// 'Flood all sites adjacent to a body of water this turn. Then submerge all
//  minions and artifacts on water.'
registerScript('Wrath of the Sea', {
  onCast: (ctx) => {
    const flooded: string[] = []
    for (const site of Object.values(ctx.state.sites)) {
      if (site.isRubble || site.flooded || getCard(site.name).thresholds.water > 0) continue
      const nearWater = orthAdjacentWrapped(ctx.state, site.x, site.y).some((s) => {
        const o = siteAt(ctx.state, s.x, s.y)
        return o && (o.flooded || getCard(o.name).thresholds.water > 0)
      })
      if (nearWater && applyFlood(ctx.state, site, ctx.controller)) {
        flooded.push(site.id)
      }
    }
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.unfloodAtEnd = [...(ctx.state.flow.unfloodAtEnd ?? []), ...flooded]
    for (const u of Object.values(ctx.state.units)) {
      if (u.isAvatar || u.region !== 'surface') continue
      const site = siteAt(ctx.state, u.x, u.y)
      if (!site || (!site.flooded && getCard(site.name).thresholds.water === 0)) continue
      trySubmerge(ctx.state, u)
    }
    for (const a of Object.values(ctx.state.artifacts)) {
      if (a.carriedBy || a.region !== 'surface') continue
      const site = siteAt(ctx.state, a.x, a.y)
      if (site && (site.flooded || getCard(site.name).thresholds.water > 0)) a.region = 'underwater'
    }
    checkStateBased(ctx.state)
  },
})
