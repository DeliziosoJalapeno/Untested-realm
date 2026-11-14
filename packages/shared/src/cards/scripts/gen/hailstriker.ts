import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'

// 'Ranged / Genesis → Target an adjacent location. Each minion there takes 1 damage and is disabled
// until your next turn.'
// The damage and the disable land together (FAQ): damage is dealt, and whatever stood there is disabled
// before deaths are settled, so a minion it kills has no Deathrite.
registerScript('Hailstriker', {
  genesisTargets: [{ what: 'square', count: 1, upTo: true, targeted: true, where: 'adjacent', label: 'target adjacent location' }],
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const t = ctx.targets[0]
    if (!self || !t || !('square' in t)) return
    const there = unitsAt(ctx.state, t.square.x, t.square.y, t.square.region ?? self.region).filter((u) => !u.isAvatar)
    for (const u of there) ctx.dealDamage({ unit: u.id }, 1)
    for (const u of there) disableUntilYourNextTurn(ctx.state, u.id, ctx.controller)
    ctx.log(`Hail batters ${there.length} minion${there.length === 1 ? '' : 's'}.`)
  },
})
