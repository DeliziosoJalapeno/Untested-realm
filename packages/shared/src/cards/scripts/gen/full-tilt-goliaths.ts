import { registerScript } from '../registry'
import { nearbySquaresW, siteAt } from '../../../engine/grid'

// 'Charge / Genesis → Cover nearby sites with silencing snow until your next turn.'
// FAQ: it silences "nearby sites only, at the moment the genesis resolves" — not units, artifacts or
// auras, and not a site played there afterwards.
registerScript('Full-tilt Goliaths', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const sites = nearbySquaresW(ctx.state, self.x, self.y)
      .map((q) => siteAt(ctx.state, q.x, q.y))
      .filter((s) => !!s && !s.isRubble)
      .map((s) => s!.id)
    if (!sites.length) return
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.siteSilences = [...(ctx.state.flow.siteSilences ?? []), { sites, player: ctx.controller, turn: ctx.state.turn }]
    ctx.log(`Snow covers ${sites.length} nearby site${sites.length === 1 ? '' : 's'}: silenced until ${ctx.state.players[ctx.controller].name}'s next turn.`)
  },
})
