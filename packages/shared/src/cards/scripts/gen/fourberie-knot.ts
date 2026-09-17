import { registerScript } from '../registry'
import { effAttack, effDefence } from '../../../engine/statics'

// 'Bearer minion takes no damage from units with 4 or more power, and is also a Faerie.'
registerScript('Fourberie Knot', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    const art = state.artifacts[selfId]
    if (!art || art.carriedBy !== victim.id || !source.attackerId) return amount
    const striker = state.units[source.attackerId]
    if (!striker) return amount
    const avg = Math.floor((effAttack(state, striker) + effDefence(state, striker)) / 2)
    return avg >= 4 ? 0 : amount
  },
})
