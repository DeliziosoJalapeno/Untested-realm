import { registerScript } from '../registry'
import { effKeywords } from '../../../engine/statics'

// "Enemy units can't move through this site's top border on the ground."
// ("top border" = the border facing the controller's opponent)
registerScript('Great Wall', {
  entryFilter: (state, selfId, unit, from, to) => {
    const site = state.sites[selfId]
    if (!site || site.controller === null || unit.controller === site.controller) return true
    if (from.region !== 'surface' || to.region !== 'surface') return true
    if (effKeywords(state, unit).airborne) return true // airborne flies over — not "on the ground"
    const frontY = site.controller === 0 ? site.y + 1 : site.y - 1
    // crossing between the wall's square and the square in front of it
    const crossing =
      (from.x === site.x && from.y === frontY && to.x === site.x && to.y === site.y) ||
      (from.x === site.x && from.y === site.y && to.x === site.x && to.y === frontY)
    return !crossing
  },
})
