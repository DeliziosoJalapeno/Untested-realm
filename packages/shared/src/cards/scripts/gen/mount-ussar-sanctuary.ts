import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, wardUnit } from '../../../engine/effects'

// '(E)(E)(E)(E) — When your Avatar arrives at Death's Door, they flee here and gain Ward.'
registerScript('Mount Ussar Sanctuary', {
  onDeathsDoor: (ctx, avatar) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || avatar.controller !== ctx.controller) return
    let earth = 0
    for (const s of Object.values(ctx.state.sites)) {
      if (s.controller === ctx.controller && !s.isRubble) earth += getCard(s.name).thresholds.earth
    }
    if (earth < 4) return
    ctx.teleport(avatar.id, self.x, self.y, 'surface')
    wardUnit(ctx.state, avatar) // avatar is not a minion — wardable even if Demon-typed
    pushLog(ctx.state, ctx.controller, `${avatar.name} flees to the Sanctuary and is warded.`)
  },
})
