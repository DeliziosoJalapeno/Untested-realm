import { registerScript, type AbilityDef } from '../registry'
import { getCard } from '../../db'
import { effSubtypes, isUnmodifiable } from '../../../engine/statics'
import { pushLog } from '../../../engine/effects'
import type { GameState, PlayerId, UnitState } from '../../../engine/types'

// '(W)(W) — You may pay the difference in cost to transform a Mortal or Bear into Bearserker from hand,
// untapped.'
// From the hand, with the water threshold: an allied Mortal or Bear becomes Bearserker where it stands,
// for Bearserker's cost less its own (never below 0), and untaps. A transform (Codex): the same game
// object — no Genesis, no summoning sickness of its own, the old card is banished, damage stays behind.
// "Bear" is read off the name (Polar Bears).
const isBear = (name: string) => /\bbears?\b/i.test(name)
const eligible = (state: GameState, u: UnitState) =>
  !u.isAvatar && u.name !== 'Bearserker' && !isUnmodifiable(state, u) && (isBear(u.name) || effSubtypes(state, u).includes('Mortal'))
const difference = (u: UnitState) => Math.max(0, (getCard('Bearserker').cost ?? 0) - (getCard(u.name).cost ?? 0))

registerScript('Bearserker', {
  handAbilities: (state: GameState, cardId: string, owner: PlayerId): AbilityDef[] =>
    Object.values(state.units)
      .filter((u) => u.controller === owner && eligible(state, u))
      .map((u) => ({
        key: `bearserk:${cardId}:${u.id}`,
        label: `Transform ${u.name} into Bearserker (pay ${difference(u)})`,
        cost: { mana: difference(u) },
        threshold: { water: 2 },
        effect: (ctx) => {
          const target = ctx.state.units[u.id]
          const p = ctx.state.players[ctx.controller]
          if (!target || !eligible(ctx.state, target) || !p.hand.includes(cardId)) return
          const old = ctx.state.cards[target.cardId]
          p.hand.splice(p.hand.indexOf(cardId), 1)
          if (old && !old.isToken) ctx.state.players[old.owner].banished.push(old.id)
          pushLog(ctx.state, ctx.controller, `${target.name} becomes a Bearserker!`)
          target.name = 'Bearserker'
          target.cardId = cardId
          target.damage = 0
          target.tapped = false
        },
      })),
})
