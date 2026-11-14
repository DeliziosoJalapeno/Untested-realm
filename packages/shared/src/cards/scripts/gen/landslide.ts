import { registerScript } from '../registry'
import { orthAdjacentWrapped, siteAt } from '../../../engine/grid'
import { swapSquares } from './site-move'
import { trapScript } from '../multi-card-utils/trap'
import type { GameState, SiteState } from '../../../engine/types'

// 'Trap (2) → Swap this site with another adjacent site.'
// Any adjacent site, whoever controls it, Rubble included; each site carries what stands on it. Not a
// target, so it can always be sprung — with no adjacent site nothing moves.
const neighbours = (state: GameState, site: SiteState) =>
  orthAdjacentWrapped(state, site.x, site.y).filter((q) => !!siteAt(state, q.x, q.y))

registerScript('Landslide', trapScript({
  label: 'swap this site with another adjacent site',
  mana: 2,
  effect: (ctx, site) => {
    const squares = neighbours(ctx.state, site)
    if (!squares.length) return ctx.log('The ground shifts, but there is no adjacent site to swap with.')
    ctx.ask({ kind: 'chooseSquare', title: 'Landslide: swap with which adjacent site?', data: { squares } }, 'slide')
  },
  conts: {
    slide: (ctx, _c, sq) => {
      const site = ctx.state.sites[ctx.sourceId]
      if (!site || !sq || typeof sq.x !== 'number') return
      if (!neighbours(ctx.state, site).some((q) => q.x === sq.x && q.y === sq.y)) return
      const other = siteAt(ctx.state, sq.x, sq.y)
      if (swapSquares(ctx.state, { x: site.x, y: site.y }, { x: sq.x, y: sq.y }, ctx.controller)) ctx.log(`⛰ Landslide! It trades places with ${other?.name ?? 'the site beside it'}.`)
    },
  },
}))
