import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { inBounds, unitsAt } from '../../../engine/grid'
import { projectileCanHit, effAttack } from '../../../engine/statics'

// 'Ranged / During basic movement, Skirmishers of Mu may perform a ranged
//  strike from any location along their path.'
registerScript('Skirmishers of Mu', {
  onUnitEntersSquare: (ctx, moved, from, via) => {
    if (moved.id !== ctx.sourceId) return
    // "During BASIC movement" — only the Skirmishers' own Move / Move-and-Attack action, NOT a
    // forced relocation (blown by Wuthering Heights, teleported, pulled) and not the summon entry.
    if (via !== 'move') return
    if (!from || from.region === ('offboard' as any) || from.x < 0) return
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.counters?.volleyTurn === ctx.state.turn) return
    ctx.ask({ kind: 'chooseOption', title: 'Skirmishers: loose a volley mid-march? (once per turn)', data: { options: ['n', 's', 'e', 'w', 'hold fire'] } }, 'volley')
  },
  conts: {
    volley: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof dir !== 'string' || dir === 'hold fire') return
      if (self.counters?.volleyTurn === ctx.state.turn) return
      self.counters = { ...self.counters, volleyTurn: ctx.state.turn }
      const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
      const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
      const tx = self.x + dx
      const ty = self.y + dy
      if (!inBounds(tx, ty)) return
      const hits = unitsAt(ctx.state, tx, ty, self.region).filter((u) => projectileCanHit(ctx.state, u))
      if (hits.length === 0) return
      if (hits.length === 1) {
        ctx.dealDamage({ unit: hits[0].id }, effAttack(ctx.state, self))
        pushLog(ctx.state, ctx.controller, `The Skirmishers pepper ${hits[0].name} mid-march!`)
        return
      }
      // co-located units → the SHOOTER chooses which is hit (projectile rule)
      ctx.ask({ kind: 'chooseTargets', title: 'Skirmishers — hit which unit?', data: { candidates: hits.map((u) => u.id), count: 1, kind: 'unit' } }, 'volleyHit', { pow: effAttack(ctx.state, self) })
    },
    volleyHit: (ctx, c: any, choice: any) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = id ? ctx.state.units[id] : null
      if (!u) return
      ctx.dealDamage({ unit: u.id }, c.pow)
      pushLog(ctx.state, ctx.controller, `The Skirmishers pepper ${u.name} mid-march!`)
    },
  },
})
