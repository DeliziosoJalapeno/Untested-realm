import { registerScript } from '../registry'

// 'Untaps the first time they take damage each turn.'
registerScript('Gnarled Laborers', {
  onSelfDamaged: (ctx, amount) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || amount <= 0 || self.counters?.lashTurn === ctx.state.turn) return
    self.counters = { ...self.counters, lashTurn: ctx.state.turn }
    if (self.tapped) ctx.untap(self.id)
  },
})
