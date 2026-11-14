import { registerScript } from '../registry'

// 'Genesis → Until your next turn, nearby allies are Protected from all but units.'
// An ongoing effect centred on the Hummocks (FAQ), not a snapshot of who was nearby: flow.hummocks is
// read by protectionsOf (statics.ts) and dropped at the start of its controller's next turn (turn.ts).
registerScript('Humming Hummocks', {
  genesis: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.hummocks = [...(ctx.state.flow.hummocks ?? []), { siteId: ctx.sourceId, player: ctx.controller, turn: ctx.state.turn }]
    ctx.log('The stones hum: nearby allies are protected from all but units.')
  },
})
