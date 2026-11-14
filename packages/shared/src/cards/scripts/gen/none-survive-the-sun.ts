import { registerScript } from '../registry'
import { GRID_W, edgesConnected } from '../../../engine/grid'
import { removeAura } from '../multi-card-utils/remove-aura'

// 'At the end of each turn, minions on the surface burn. Those here take 20 damage, those elsewhere
// take 1. Then the sun moves one step westward, or it is dispelled.'
// Only minions on the surface burn — none in the void, underground or underwater (FAQ). West is the
// realm's left edge (x - 1). At that edge the sun has nowhere to go and is dispelled, unless the edges
// are connected (Magellan Globe), where it circles for ever (FAQ: "that is how the sun works").
registerScript('None Survive the Sun', {
  endOfEveryTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    const here = (x: number, y: number) => aura.squares.some((s) => s.x === x && s.y === y)
    const burning = Object.values(ctx.state.units).filter((u) => !u.isAvatar && u.region === 'surface')
    if (burning.length) ctx.log('☀ The sun burns every minion on the surface.')
    for (const u of burning) ctx.dealDamage({ unit: u.id }, here(u.x, u.y) ? 20 : 1)
    ctx.settleDeaths()
    const sun = ctx.state.auras[ctx.sourceId]
    if (!sun) return
    const west = Math.min(...sun.squares.map((s) => s.x)) - 1
    if (west < 0 && !edgesConnected(ctx.state)) {
      ctx.log('The sun sets beyond the western edge of the realm.')
      return removeAura(ctx)
    }
    const shift = (x: number) => (x - 1 + GRID_W) % GRID_W
    sun.squares = sun.squares.map((s) => ({ x: shift(s.x), y: s.y }))
    if (sun.anchor) sun.anchor = { x: shift(sun.anchor.x), y: sun.anchor.y }
    ctx.log('The sun moves one step westward.')
  },
})
