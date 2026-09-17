import { registerScript } from '../registry'

// 'UPDATED: Bearer takes and deals double strike damage against units.'
registerScript('Grim Guisarme', {
  damageModifierKind: 'mul',
  bearerStrikeMultiplier: 2,
  damageModifier: (state, selfId, victim, amount, source) => {
    const art = state.artifacts[selfId]
    if (!art || art.carriedBy !== victim.id) return amount
    return source.kind === 'strike' ? amount * 2 : amount
  },
})
