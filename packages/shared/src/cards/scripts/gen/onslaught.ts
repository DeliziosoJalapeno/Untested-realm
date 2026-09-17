import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// "This turn, allies gain +1 power, Charge, and can't be immobilized, silenced, or disabled."
registerScript('Onslaught', {
  onCast: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (u.controller !== ctx.controller) continue
      ctx.addPower(u.id, 1, 'endOfTurn')
      ctx.grantKeyword(u.id, 'charge', 'endOfTurn')
      ctx.grantKeyword(u.id, 'undisableable', 'endOfTurn')
    }
    pushLog(ctx.state, ctx.controller, 'ONSLAUGHT!')
  },
})
