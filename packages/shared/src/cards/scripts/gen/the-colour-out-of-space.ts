import { registerScript } from '../registry'
import { inBounds, siteAt } from '../../../engine/grid'

// 'Provides no mana or threshold if not adjacent to the void.'
registerScript('The Colour Out of Space', {
  siteProvides: (state, site) =>
    [{ x: site.x + 1, y: site.y }, { x: site.x - 1, y: site.y }, { x: site.x, y: site.y + 1 }, { x: site.x, y: site.y - 1 }]
      .some((s) => inBounds(s.x, s.y) && !siteAt(state, s.x, s.y)),
})
