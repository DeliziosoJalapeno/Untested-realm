import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Damage dealt to minions nearby is lethal.'
registerScript('Drums of Doom', {
  damageModifierKind: 'lethal',
  damageModifier: (state, selfId, victim, amount, source) => {
    const art = state.artifacts[selfId]
    if (!art || victim.isAvatar) return amount
    if (nearbySquaresW(state, art.x, art.y).some((s) => s.x === victim.x && s.y === victim.y)) {
      return { amount, lethal: true }
    }
    return amount
  },
})
