import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import { applyGrid, type Cell } from '../multi-card-utils/apply-grid'

// 'Genesis → Sacrifice this site to deal damage to each other unit at affected sites: 5 at this site,
// and 3 at each nearby site.' (the card prints the 3x3 grid: 5 in the middle, 3 all around)
// The sacrifice pays for the eruption: with no site of his controller's under him, nothing happens.
const ERUPTION: Cell[] = []
for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) ERUPTION.push({ dx, dy, dmg: dx === 0 && dy === 0 ? 5 : 3 })

registerScript('King Krakalak', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.region === 'void') return
    const site = siteAt(ctx.state, self.x, self.y)
    if (!site || site.isRubble || site.controller !== ctx.controller) return ctx.log('King Krakalak has no site to sacrifice.')
    ctx.destroySite(site.id, ctx.controller, true)
    if (ctx.state.sites[site.id] && !ctx.state.sites[site.id].isRubble) return // it couldn't be sacrificed
    ctx.log('🌋 King Krakalak erupts!')
    applyGrid(ctx, { x: self.x, y: self.y }, ERUPTION, 'n', { region: 'allRegions', atopSitesOnly: true, skipUnitId: self.id })
  },
})
