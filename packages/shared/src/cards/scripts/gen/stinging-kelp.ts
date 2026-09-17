import { registerScript } from '../registry'
import { getCard } from '../../db'
import { orthAdjacentWrapped, siteAt, unitsAt } from '../../../engine/grid'

// 'Genesis → Deal 1 damage to each minion at target site in this body of water.'
registerScript('Stinging Kelp', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const isWater = (x: number, y: number) => {
      const s = siteAt(ctx.state, x, y)
      return !!s && (s.flooded || getCard(s.name).thresholds.water > 0)
    }
    const seen = new Set([`${self.x},${self.y}`])
    const queue = [{ x: self.x, y: self.y }]
    const body: { x: number; y: number }[] = []
    while (queue.length) {
      const cur = queue.shift()!
      body.push(cur)
      for (const n of orthAdjacentWrapped(ctx.state, cur.x, cur.y)) {
        const key = `${n.x},${n.y}`
        if (!seen.has(key) && isWater(n.x, n.y)) {
          seen.add(key)
          queue.push(n)
        }
      }
    }
    if (!body.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'The kelp stings which site in this body of water?', data: { squares: body } }, 'sting')
  },
  conts: {
    sting: (ctx, _c, sq) => {
      if (!sq) return
      for (const u of unitsAt(ctx.state, sq.x, sq.y)) {
        if (!u.isAvatar) ctx.dealDamage({ unit: u.id }, 1)
      }
    },
  },
})
