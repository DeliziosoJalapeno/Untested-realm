import { registerScript } from '../registry'
import { killUnit } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

// '(F)(F)(F) – Genesis → Each player chooses one of their minions. Kill the rest.'
registerScript('Fields of Camlann', {
  genesis: (ctx) => {
    for (const pid of [ctx.controller, (1 - ctx.controller) as PlayerId]) {
      const mine = Object.values(ctx.state.units).filter((u) => u.controller === pid && !u.isAvatar)
      if (mine.length > 1) {
        ctx.ask(
          { kind: 'chooseTargets', title: 'Camlann: choose your sole survivor', data: { candidates: mine.map((u) => u.id), count: 1, kind: 'unit' }, player: pid },
          'survivor',
          { pid },
        )
      }
    }
  },
  conts: {
    survivor: (ctx, contCtx, choice) => {
      const keep = Array.isArray(choice) ? choice[0] : choice
      for (const u of Object.values(ctx.state.units)) {
        if (u.controller === contCtx.pid && !u.isAvatar && u.id !== keep) killUnit(ctx.state, u.id)
      }
    },
  },
})
