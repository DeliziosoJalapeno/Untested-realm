import { registerScript } from '../registry'
import { getCard } from '../../db'
import { inBounds, siteAt, unitsAt } from '../../../engine/grid'

// 'Airborne, Air Spellcaster / After Wind Sylph casts a Magic spell, she may
//  push a unit here one step.'
registerScript('Wind Sylph', {
  onSpellCast: (ctx, by, cardName, casterId) => {
    if (by !== ctx.controller || casterId !== ctx.sourceId) return
    if (getCard(cardName).type !== 'Magic') return
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const here = unitsAt(ctx.state, self.x, self.y, self.region).filter((u) => u.id !== self.id).map((u) => u.id)
    if (!here.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Wind Sylph: gust who away? (skip for none)', data: { candidates: here, count: 1, upTo: true, kind: 'unit' } }, 'gust')
  },
  conts: {
    gust: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (!u) return
      const steps = [
        { x: u.x + 1, y: u.y }, { x: u.x - 1, y: u.y }, { x: u.x, y: u.y + 1 }, { x: u.x, y: u.y - 1 },
      ].filter((s) => inBounds(s.x, s.y) && siteAt(ctx.state, s.x, s.y))
      if (!steps.length) return
      ctx.ask({ kind: 'chooseSquare', title: `${u.name} is blown where?`, data: { squares: steps } }, 'land', { unitId: u.id })
    },
    land: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (u && sq) ctx.teleport(u.id, sq.x, sq.y, u.region, { push: true }) // "push one step" — forced push
    },
  },
})
