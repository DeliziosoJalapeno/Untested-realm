import { registerScript, type AbilityDef, type EffectAPI } from '../registry'
import { siteAt } from '../../../engine/grid'
import { cardCemeteryAbilities } from '../../../engine/statics'
import { BONE_RAISERS, raiseFromCemetery } from '../multi-card-utils/bone-raisers'

// "Can't move to defend." (Skeleton token)
// Also grants bone-raiser abilities: click a Skeleton to sacrifice IT and raise a
// bone-raiser (or a Vivien copying one) from your cemetery onto its square.
registerScript('Skeleton', {
  cantDefend: true,
  grantsAbilities: (state, selfId, unit) => {
    if (unit.id !== selfId) return []
    const self = state.units[selfId]
    if (!self || self.name !== 'Skeleton' || !siteAt(state, self.x, self.y)) return []
    const p = state.players[self.controller]
    const out: AbilityDef[] = []
    const seen = new Set<string>()
    for (const cardId of p.cemetery) {
      if (seen.has(cardId)) continue
      const nm = state.cards[cardId]?.name
      if (!nm) continue
      const cost = BONE_RAISERS[nm]
      // a card the Skeleton can reshape into: a printed bone-raiser, OR a Vivien whose copied
      // cemetery abilities currently include a bone-raise (spellcaster raiser in the realm).
      const vivienCopy = cost === undefined && cardCemeteryAbilities(state, cardId, self.controller).some((a) => a.key.startsWith('boneRaise:'))
      if (cost === undefined && !vivienCopy) continue
      seen.add(cardId)
      const c = cost ?? 0
      out.push({
        key: `bones:${cardId}`,
        label: `(${c}), sacrifice → raise ${nm} here`,
        cost: { mana: c, sacrificeSelf: true },
        contOwner: 'Bone Jumble',
        effect: (ctx: EffectAPI) => {
          const sk = ctx.state.units[ctx.sourceId]
          if (!sk || !siteAt(ctx.state, sk.x, sk.y)) return
          // sacrificeSelf kills the Skeleton AFTER the effect, so summon to its square first.
          raiseFromCemetery(ctx.state, ctx.controller, cardId, sk.x, sk.y)
        },
      })
    }
    return out
  },
})
