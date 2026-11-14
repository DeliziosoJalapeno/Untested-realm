import { registerScript } from '../registry'
import { getCard } from '../../db'
import { effectSummonUnit, pushLog } from '../../../engine/effects'
import { affinity, collectionBanned, takeFromCollection } from '../../../engine/statics'
import { meetsThreshold } from '../../../engine/casting'
import type { GameState, PlayerId, UnitState } from '../../../engine/types'

// 'Genesis → Cast an Alpha Beast from your collection here, disabled until your next turn.'
// "An alpha Beast": a Beast with the Alpha set symbol (FAQ) — here, one that has an Alpha printing. It is
// CAST, so its mana cost is paid and its threshold needed; it enters disabled, so it has no Genesis.
// Golden rule (FAQ): Polar Bears cast this way are the Alpha printing — 2 mana and 2 power.
const NONE = '(none)'
const thawCost = (name: string) => (name === 'Polar Bears' ? 2 : getCard(name).cost ?? 0)
function thawable(state: GameState, player: PlayerId): string[] {
  const p = state.players[player]
  return Object.entries(p.collection ?? {})
    .filter(([name, n]) => {
      if ((n ?? 0) <= 0 || collectionBanned(state, player, name)) return false
      const def = getCard(name)
      return def.type === 'Minion' && def.subtypes.includes('Beast') && def.sets.includes('Alpha')
        && thawCost(name) <= p.mana && meetsThreshold(affinity(state, player), def.thresholds)
    })
    .map(([name]) => name)
}

registerScript('Ancient Thaw', {
  genesis: (ctx) => {
    const beasts = thawable(ctx.state, ctx.controller)
    if (!beasts.length) return
    ctx.ask({ kind: 'chooseOption', title: 'Ancient Thaw — cast which Alpha Beast from your collection here?', data: { options: [...beasts, NONE] } }, 'thaw')
  },
  conts: {
    thaw: (ctx, _c, choice) => {
      const site = ctx.state.sites[ctx.sourceId]
      if (!site || typeof choice !== 'string' || choice === NONE || !thawable(ctx.state, ctx.controller).includes(choice)) return
      ctx.spendMana(ctx.controller, thawCost(choice))
      takeFromCollection(ctx.state, ctx.controller, choice)
      const cardId = `c${ctx.state.nextId++}`
      ctx.state.cards[cardId] = { id: cardId, name: choice, owner: ctx.controller }
      const unit: UnitState = {
        id: `u${ctx.state.nextId++}`, cardId, name: choice, owner: ctx.controller, controller: ctx.controller,
        isAvatar: false, x: site.x, y: site.y, region: 'surface', tapped: false, damage: 0,
        enteredTurn: ctx.state.turn, carrying: [], carryingUnits: [], usedThisTurn: {},
        modifiers: [{ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: ctx.state.turn, sourcePlayer: ctx.controller }],
      }
      // the Alpha Polar Bears are a 2/2 (the card data carries the current 3/3)
      if (choice === 'Polar Bears') unit.modifiers.push({ kind: 'power', amount: -1, duration: 'permanent', turn: ctx.state.turn, sourcePlayer: ctx.controller } as UnitState['modifiers'][number])
      pushLog(ctx.state, ctx.controller, `${choice} thaws out of the ice, still frozen stiff.`)
      effectSummonUnit(ctx.state, unit)
    },
  },
})
