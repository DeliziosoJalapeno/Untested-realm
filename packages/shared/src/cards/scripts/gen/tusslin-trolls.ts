import { registerScript } from '../registry'
import { adjacentSquaresW, unitsAt } from '../../../engine/grid'
import { randIndex } from '../../../engine/effects'
import type { GameState, UnitState } from '../../../engine/types'

// 'At the end of your turn, strike target adjacent minion for D6 damage.'
// FAQ: with no other adjacent minion they must strike themselves; the target is chosen first and the
// die is rolled as the ability resolves. A Stealthed enemy can't be targeted.
const victims = (state: GameState, self: UnitState): UnitState[] =>
  adjacentSquaresW(state, self.x, self.y)
    .flatMap((q) => unitsAt(state, q.x, q.y, self.region))
    .filter((u) => !u.isAvatar && u.id !== self.id && !(u.stealth && u.controller !== self.controller))

registerScript("Tusslin' Trolls", {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const others = victims(ctx.state, self).map((u) => u.id)
    const candidates = others.length ? others : [self.id]
    ctx.ask({ kind: 'chooseTargets', title: "Tusslin' Trolls — which adjacent minion do they clobber (D6 damage)?", data: { candidates, count: 1, upTo: false, kind: 'unit' } }, 'tussle')
  },
  conts: {
    tussle: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      const id = Array.isArray(choice) ? choice[0] : choice
      const target = typeof id === 'string' ? ctx.state.units[id] : undefined
      if (!self || !target) return
      const roll = 1 + randIndex(ctx.state, 6)
      ctx.log(`🎲 The Trolls roll a ${roll} and clobber ${target.id === self.id ? 'themselves' : target.name}.`)
      ctx.dealDamage({ unit: target.id }, roll)
    },
  },
})
