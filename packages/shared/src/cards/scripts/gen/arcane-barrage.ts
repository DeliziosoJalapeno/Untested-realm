import { registerScript } from '../registry'
import { fireVolleyProjectiles } from '../../../engine/combat'

// ---- X-cost spells (X = mana you choose to spend on resolution) ----

// 'Shoot X projectiles in the same direction, one at a time. Each deals 1 damage.'
registerScript('Arcane Barrage', {
  // X is the mana you spend, so casting needs at least (1) — with none, the spell
  // would fizzle to no effect. Gating here (as Twist of Fate does) makes canCast
  // reject the cast, so the GUI won't let you throw the card away for nothing.
  extraCastCheck: (state, player) =>
    state.players[player].mana >= 1 ? null : 'Arcane Barrage needs at least (1) mana to spend on X.',
  onCast: (ctx) => {
    const max = ctx.state.players[ctx.controller].mana
    if (max <= 0) return ctx.log('No mana left for X.')
    const options = Array.from({ length: max }, (_, i) => String(i + 1))
    ctx.ask({ kind: 'chooseOption', title: `Arcane Barrage: choose X (you have ${max} mana)`, data: { options } }, 'chooseX')
  },
  conts: {
    chooseX: (ctx, _c, choice) => {
      const x = Number(choice) || 0
      const p = ctx.state.players[ctx.controller]
      if (x <= 0 || p.mana < x) return
      ctx.spendMana(ctx.controller, x)
      ctx.ask({ kind: 'chooseOption', title: 'Barrage in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'barrage', { x })
    },
    barrage: (ctx, contCtx, dir) => {
      const caster = ctx.caster!
      if (!dir) return
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: caster.x, oy: caster.y, region: caster.region,
        dir: String(dir), volleys: contCtx.x, damage: 1, excludeId: caster.id, srcName: 'Arcane Barrage',
      })
    },
  },
})
