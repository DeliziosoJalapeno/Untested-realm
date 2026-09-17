// Shared helpers for Chaos Twister and Erik's Curiosa (no registerScript — skipped by gen:card-index).

import { type EffectAPI } from '../registry'
import { GRID_W, GRID_H, unitsAt, siteAt, squareLabel } from '../../../engine/grid'
import { effAttack, collectionNames, takeFromCollection } from '../../../engine/statics'
import { mulberry32 } from '../../../engine/rng'
import { pushLog } from '../../../engine/effects'
import { awardAchievement } from '../../../engine/achievements.catalog'
import type { GameState } from '../../../engine/types'

export type BlowDirection = 'n' | 's' | 'e' | 'w'

/** the wedge of squares "downwind" of origin in the given direction */
export function coneSquares(origin: { x: number; y: number }, dir: BlowDirection): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let x = 0; x < GRID_W; x++) {
    for (let y = 0; y < GRID_H; y++) {
      const dx = x - origin.x
      const dy = y - origin.y
      const inCone =
        dir === 'e' ? dx >= 1 && Math.abs(dy) <= dx :
        dir === 'w' ? -dx >= 1 && Math.abs(dy) <= -dx :
        dir === 'n' ? dy >= 1 && Math.abs(dx) <= dy :
        -dy >= 1 && Math.abs(dx) <= -dy
      if (inCone) out.push({ x, y })
    }
  }
  return out
}

/** one 50/20/30 roll → landing square or null (off the board) */
export function rollLanding(state: GameState, cone: { x: number; y: number }[]): { x: number; y: number } | null {
  const inConeSites = cone.map((s) => siteAt(state, s.x, s.y)).filter(Boolean)
  const outConeSites = Object.values(state.sites).filter((s) => !cone.some((c) => c.x === s.x && c.y === s.y))
  const rnd = mulberry32(state.seed)
  const roll = rnd()
  let landing: { x: number; y: number } | null = null
  if (roll < 0.5 && inConeSites.length > 0) {
    const pick = inConeSites[Math.floor(rnd() * inConeSites.length)]!
    landing = { x: pick.x, y: pick.y }
  } else if (roll < 0.7 && outConeSites.length > 0) {
    const pick = outConeSites[Math.floor(rnd() * outConeSites.length)]
    landing = { x: pick.x, y: pick.y }
  }
  state.seed = Math.floor(rnd() * 0xffffffff)
  return landing
}

export function landingLabel(landing: { x: number; y: number } | null): string {
  return landing ? `lands at ${squareLabel(landing.x, landing.y)}` : 'flies off the board'
}

export function applyLanding(ctx: EffectAPI, minionId: string, landing: { x: number; y: number } | null): void {
  const state = ctx.state as GameState
  const minion = state.units[minionId]
  if (!minion) return
  if (!landing) {
    pushLog(state, null, `${minion.name} tumbles off the realm entirely and is banished!`)
    ctx.banish(minion.id)
    return
  }
  const power = effAttack(state, minion)
  ctx.teleport(minion.id, landing.x, landing.y, 'surface')
  pushLog(state, null, `${minion.name} crashes down at ${squareLabel(landing.x, landing.y)}!`)
  // Death blow — the crash lands on a site holding the caster's enemies (kill a minion / hit the avatar)
  const victims = unitsAt(state, landing.x, landing.y, 'surface').filter((u) => u.id !== minion.id && u.controller !== ctx.controller)
  const avatarHit = power > 0 && victims.some((u) => u.isAvatar)
  for (const u of unitsAt(state, landing.x, landing.y, 'surface')) {
    ctx.dealDamage({ unit: u.id }, power)
  }
  ctx.settleDeaths() // resolve the crash's deaths before checking whether a minion actually died (achievement)
  const minionKilled = victims.some((u) => !u.isAvatar && !state.units[u.id])
  if (avatarHit || minionKilled) awardAchievement(state, 'death-blow-twister', ctx.controller)
}

/** take one copy of `name` from the caster's collection into their hand (no shared-log name leak). */
export function curiosaDraw(ctx: EffectAPI, name: string): void {
  if (!collectionNames(ctx.state, ctx.controller).includes(name)) return
  takeFromCollection(ctx.state, ctx.controller, name)
  const cardId = `c${ctx.state.nextId++}`
  ctx.state.cards[cardId] = { id: cardId, name, owner: ctx.controller }
  ctx.state.players[ctx.controller].hand.push(cardId)
  pushLog(ctx.state, ctx.controller, `${ctx.state.players[ctx.controller].name} draws a card from their collection.`)
}
