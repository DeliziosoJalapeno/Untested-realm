import { registerScript } from '../registry'
import { getCard } from '../../db'
import { legalSiteSquares, playSite } from '../../../engine/casting'
import type { GameState, PlayerId } from '../../../engine/types'

// 'Genesis → Play or draw a site.'
// The Avatar's own choice, made by a minion: play a site from hand (normal placement rules), or draw one.
const PLAY = 'Play a site from hand'
const DRAW = 'Draw a site'
const playable = (state: GameState, p: PlayerId): string[] =>
  [...new Set(state.players[p].hand.map((id) => state.cards[id].name))]
    .filter((n) => getCard(n).type === 'Site' && legalSiteSquares(state, p, n).length > 0)

registerScript('Reed Cord Measurer', {
  genesis: (ctx) => {
    const canPlay = playable(ctx.state, ctx.controller).length > 0
    const canDraw = ctx.state.players[ctx.controller].atlas.length > 0
    if (canPlay && canDraw) return ctx.ask({ kind: 'chooseOption', title: 'Reed Cord Measurer — play or draw a site?', data: { options: [PLAY, DRAW] } }, 'mode')
    if (canPlay) return ctx.ask({ kind: 'chooseOption', title: 'Play which site?', data: { options: playable(ctx.state, ctx.controller) } }, 'which')
    if (canDraw) ctx.draw(ctx.controller, 'atlas')
  },
  conts: {
    mode: (ctx, _c, choice) => {
      if (choice === PLAY) return ctx.ask({ kind: 'chooseOption', title: 'Play which site?', data: { options: playable(ctx.state, ctx.controller) } }, 'which')
      ctx.draw(ctx.controller, 'atlas')
    },
    which: (ctx, _c, choice) => {
      if (typeof choice !== 'string' || !playable(ctx.state, ctx.controller).includes(choice)) return
      ctx.ask({ kind: 'chooseSquare', title: `Place ${choice} where?`, data: { squares: legalSiteSquares(ctx.state, ctx.controller, choice) } }, 'place', { name: choice })
    },
    place: (ctx, c, sq) => {
      if (!sq || typeof sq.x !== 'number') return
      const cardId = ctx.state.players[ctx.controller].hand.find((id) => ctx.state.cards[id].name === c.name)
      if (!cardId) return
      const err = playSite(ctx.state, ctx.controller, cardId, sq.x, sq.y)
      if (err) ctx.log(err)
    },
  },
})
