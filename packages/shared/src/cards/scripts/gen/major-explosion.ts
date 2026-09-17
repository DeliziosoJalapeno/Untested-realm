import { registerScript } from '../registry'
import { stepDistance } from '../../../engine/movement'
import { CROSS_3X3, applyGrid, resolveCells } from '../multi-card-utils/apply-grid'

// 'Target a location up to two steps away. [3 5 3 / 5 7 5 / 3 5 3]'
registerScript('Major Explosion', {
  areaDamage: (state, casterId, params) => {
    const caster = state.units[casterId]
    if (!caster || !params.at) return null
    if (stepDistance(caster, params.at) > 2) return null
    return resolveCells(state, params.at, CROSS_3X3, 'n')
  },
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location (≤2 steps)' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('square' in t)) return
    const caster = ctx.caster!
    if (stepDistance(caster, t.square) > 2) return ctx.log('Too far away.') // "up to two steps away" (def. 1)
    applyGrid(ctx, t.square, CROSS_3X3, 'n')
  },
})
