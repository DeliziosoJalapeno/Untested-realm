import { registerScript } from '../registry'
import { pushLog, dealDamageToUnit, checkStateBased } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'Bearer has +1 power, and its strikes splash full damage to each other enemy
//  at a struck unit's location.'
registerScript('Flaming Sword', {
  artifactGrantsPower: (state, artifactId, unit) => (state.artifacts[artifactId]?.carriedBy === unit.id ? 1 : 0),
  onUnitDamaged: (ctx, victim, amount, source) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || source?.kind !== 'strike' || source.attackerId !== art.carriedBy) return
    const bearer = ctx.state.units[art.carriedBy!]
    if (!bearer) return
    for (const u of unitsAt(ctx.state, victim.x, victim.y, victim.region)) {
      if (u.id === victim.id || u.controller === bearer.controller) continue
      dealDamageToUnit(ctx.state, u, amount, bearer.controller, {
        source: { player: bearer.controller, kind: 'effect', name: 'Flaming Sword' },
      })
      pushLog(ctx.state, ctx.controller, `Flames splash onto ${u.name}!`)
    }
    checkStateBased(ctx.state)
  },
})
