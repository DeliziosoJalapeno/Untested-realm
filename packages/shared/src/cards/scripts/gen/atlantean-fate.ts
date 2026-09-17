import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, trySubmerge, applyFlood } from '../../../engine/effects'
import { siteAt, unitsAt } from '../../../engine/grid'

// 'Affected non-Ordinary sites are flooded. They are water sites, only provide
//  Water threshold, and lose all other abilities. / Genesis → Submerge all
//  minions and artifacts atop affected sites.'
registerScript('Atlantean Fate', {
  auraSilencesSites: true,
  auraLimitsToWaterThreshold: true,
  genesis: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    for (const sq of aura.squares) {
      const site = siteAt(ctx.state, sq.x, sq.y)
      if (site && !site.isRubble && getCard(site.name).rarity !== 'Ordinary') applyFlood(ctx.state, site, ctx.controller)
      for (const u of unitsAt(ctx.state, sq.x, sq.y, 'surface')) trySubmerge(ctx.state, u)
      for (const a of Object.values(ctx.state.artifacts)) {
        if (!a.carriedBy && a.x === sq.x && a.y === sq.y && a.region === 'surface') a.region = 'underwater'
      }
    }
    pushLog(ctx.state, null, 'The fate of Atlantis comes for these lands.')
  },
})
