import { registerScript } from '../registry'
import { siteSilenced } from '../../../engine/statics'

// 'Disable effects on minions here are permanent, but are removed if they leave.'
// FAQ: it "replaces the normal end condition for disable effects with 'until it leaves'" — a Slumbering
// Giantess summoned here sleeps through damage, and wakes the moment she leaves, hurt or not.
// The "permanent" half is permafrostHolds (statics.ts): a timed disable doesn't run out and a sleeper
// isn't woken by damage while the minion is here. This script is the other half: leaving lifts them.
registerScript('Permafrost', {
  onUnitEntersSquare: (ctx, moved, from) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || moved.isAvatar || from.region === 'void') return
    if (from.x !== self.x || from.y !== self.y) return
    if (moved.x === self.x && moved.y === self.y && moved.region !== 'void') return // still here (changed level)
    if (siteSilenced(ctx.state, self)) return
    const had = !!moved.disabled || moved.modifiers.some((m) => m.kind === 'keyword' && m.keyword === 'disabled')
    if (!had) return
    moved.modifiers = moved.modifiers.filter((m) => !(m.kind === 'keyword' && m.keyword === 'disabled'))
    moved.disabled = undefined
    if (moved.counters?.asleep) delete moved.counters.asleep
    ctx.log(`${moved.name} leaves the Permafrost and thaws.`)
  },
})
