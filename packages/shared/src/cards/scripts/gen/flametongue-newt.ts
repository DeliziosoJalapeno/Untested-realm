import { registerScript } from '../registry'
import { fireVolleyProjectiles, breakStealth } from '../../../engine/combat'

// 'Once on your turn, may just for fun, shoot a projectile that deals damage 1.'
// Not a ranged strike and no tap: a 1-damage projectile, once on each of its controller's turns.
registerScript('Flametongue Newt', {
  abilities: [{
    key: 'spit',
    label: 'Shoot a 1-damage projectile (once on your turn)',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'Flametongue Newt spits fire — which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'spit')
    },
  }],
  conts: {
    spit: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof dir !== 'string') return
      breakStealth(ctx.state, self)
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y, region: self.region,
        dir, volleys: 1, damage: 1, excludeId: self.id, srcName: 'Flametongue Newt',
      })
    },
  },
})
