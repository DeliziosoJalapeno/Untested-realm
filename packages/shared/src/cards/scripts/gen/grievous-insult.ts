import { registerScript } from '../registry'

// 'May be cast by any ally. Silence target nearby minion this turn and tap it. Draw a spell.'
// (timed silence: modeled as silence + auto-unsilence at end of turn via flow)
registerScript('Grievous Insult', {
  casterFilter: () => null,
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    u.silenced = true
    u.tapped = true
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.unsilenceAtEnd = [...(ctx.state.flow.unsilenceAtEnd ?? []), u.id]
    ctx.draw(ctx.controller, 'spellbook')
  },
})
