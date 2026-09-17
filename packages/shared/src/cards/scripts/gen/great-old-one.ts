import { registerScript } from '../registry'
import { pushLog, checkStateBased } from '../../../engine/effects'

// 'Submerge / Genesis → Permanently flood the entire realm, including voids.'
registerScript('Great Old One', {
  genesis: (ctx) => {
    for (const s of Object.values(ctx.state.sites)) {
      if (!s.isRubble) s.flooded = true
    }
    pushLog(ctx.state, null, 'The Great Old One rises — the realm drowns beneath the deluge!')
    checkStateBased(ctx.state)
  },
})
