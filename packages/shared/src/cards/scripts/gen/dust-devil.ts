import { registerScript } from '../registry'

// 'Movement +1 / Takes no damage while attacking.'
// "While attacking": the strikes of a fight it started with an attack (flow.attackPass names the
// attacker while those strikes land — combat.ts). Not while defending, intercepting or merely moving.
registerScript('Dust Devil', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount) => {
    if (victim.id !== selfId || amount <= 0) return amount
    return state.flow?.attackPass === selfId ? { amount: 0, prevented: true } : amount
  },
})
