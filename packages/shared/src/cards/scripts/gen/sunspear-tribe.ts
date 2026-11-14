import { registerScript } from '../registry'
import { fireVolleyProjectiles, breakStealth } from '../../../engine/combat'

// 'Once per game → Throw a projectile that deals 1 damage.'
// The one spear is spent when it is thrown (counters.sunspearThrown), whatever it hits.
registerScript('Sunspear Tribe', {
  abilities: [{
    key: 'spear',
    label: 'Throw a 1-damage projectile (once per game)',
    cost: {},
    available: (state, sourceId) => !state.units[sourceId]?.counters?.sunspearThrown,
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'Sunspear Tribe throw their spear — which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'spear')
    },
  }],
  conts: {
    spear: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof dir !== 'string' || self.counters?.sunspearThrown) return
      self.counters = { ...self.counters, sunspearThrown: 1 }
      breakStealth(ctx.state, self)
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y, region: self.region,
        dir, volleys: 1, damage: 1, excludeId: self.id, srcName: 'Sunspear Tribe',
      })
    },
  },
})
