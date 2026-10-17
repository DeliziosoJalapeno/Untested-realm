// A projectile spell cast by an EFFECT (effectCastSpell — Chaoswish copies, collection casts…) asks its
// direction with its own chooseOption prompt. Every other n/s/e/w prompt carries the origin square and each
// direction's lane (`from` / `dirs`, see EffectAPI.ask) so a client can draw the arrows on the board from
// the caster — this one carried bare options, so clients fell back to a detached compass.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, waiveThreshold } from './helpers'
import { avatarOf, directionReach, effectCastSpell, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('an effect-cast projectile asks its direction from the caster', () => {
  it('the direction prompt carries the caster square and each lane', () => {
    const g = newGame() as GameState; keepBoth(g)
    waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    effectCastSpell(g, 0, 'Ice Lance', { free: true })
    const p: any = g.prompts.find((q) => q.player === 0 && q.kind === 'chooseOption')
    expect(p?.title).toMatch(/which direction/)
    expect(p.data.options).toEqual(['n', 's', 'e', 'w'])
    expect(p.data.from).toEqual({ x: av.x, y: av.y })
    expect(p.data.dirs).toEqual(directionReach(g, av.x, av.y))
  })
})
