import { registerScript, type EffectAPI } from '../registry'
import { firstProjectileImpact } from '../../../engine/combat'
import { strikeOnce } from '../multi-card-utils/strike-once'

// Grapple Shot: drag the ally to the hit unit's square, then offer the strike-on-arrival.
function grappleHit(ctx: EffectAPI, allyId: string, hitId: string) {
  const ally = ctx.state.units[allyId]
  const hit = ctx.state.units[hitId]
  if (!ally || !hit) return
  ctx.teleport(ally.id, hit.x, hit.y, hit.region, { push: true }) // a grapple/pull, not a Teleport (Perilous Bridge / Cage of Sidrak)
  ctx.ask({ kind: 'yesNo', title: `Strike ${hit.name} on arrival?` }, 'land', { allyId: ally.id, victim: hit.id })
}

// 'An ally shoots a projectile. If it hits a unit, the ally is dragged to that
// location, and may strike the hit unit when it arrives.'
registerScript('Grapple Shot', {
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'the grappling ally' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const ally = ctx.state.units[t.unit]
    // the grapple fires FROM the ally minion -- anchor the direction-picker's conveyor belt there,
    // not on the avatar caster (from: seeds data.from/dirs in the ctx.ask generalization)
    ctx.ask({ kind: 'chooseOption', title: 'Fire the grapple in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'fire', { allyId: t.unit, from: ally ? { x: ally.x, y: ally.y } : undefined })
  },
  conts: {
    fire: (ctx, contCtx, dir) => {
      const ally = ctx.state.units[contCtx.allyId]
      if (!ally || !dir) return
      // firstProjectileImpact void-stops and returns the co-located hittable units
      const impact = firstProjectileImpact(ctx.state, {
        player: ctx.controller, ox: ally.x, oy: ally.y, region: ally.region, dir: String(dir), filter: 'notStealth', excludeId: ally.id,
      })
      if (!impact) return ctx.log('The grapple finds nothing.')
      if (impact.candidates.length === 1) return grappleHit(ctx, ally.id, impact.candidates[0])
      // the shooter chooses which co-located unit the grapple latches onto
      ctx.ask(
        { kind: 'chooseTargets', title: 'Which unit does the grapple hit?', data: { candidates: impact.candidates, count: 1, kind: 'unit' } },
        'grapplePick',
        { allyId: ally.id },
      )
    },
    grapplePick: (ctx, contCtx, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') grappleHit(ctx, contCtx.allyId, id)
    },
    land: (ctx, contCtx, choice) => {
      const ally = ctx.state.units[contCtx.allyId]
      if (choice && ally && ctx.state.units[contCtx.victim]) strikeOnce(ctx, ally, contCtx.victim)
    },
  },
})
