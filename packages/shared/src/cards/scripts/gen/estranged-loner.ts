import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import { fromCollection } from '../multi-card-utils/from-collection'

// 'Deathrite → You may summon a Horrible Hybrids from your collection to this location.'
registerScript('Estranged Loner', {
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    ctx.ask({ kind: 'yesNo', title: 'The Loner’s true kin answer — summon Horrible Hybrids here?' }, 'kin', { x: self.x, y: self.y })
  },
  conts: {
    kin: (ctx, c, yes) => {
      if (yes && siteAt(ctx.state, c.x as number, c.y as number)) fromCollection(ctx, 'Horrible Hybrids', c.x as number, c.y as number)
    },
  },
})
