import { registerScript } from '../registry'

// 'Stealth, Can't be disabled / (1), Banish this from your cemetery → An ally gains "Stealth, Can't be
// disabled."'
// The second half works from the cemetery: pay 1, the Fox's card is banished, and one allied unit gains
// both abilities for good ("an ally", not a target — no Ward break).
registerScript('Arctic Fox', {
  immuneToDisable: true,
  cemeteryAbilities: (_state, cardId) => [{
    key: `fox:${cardId}`,
    label: 'Banish Arctic Fox → an ally gains "Stealth, Can\'t be disabled"',
    cost: { mana: 1 },
    effect: (ctx) => {
      const allies = Object.values(ctx.state.units).filter((u) => u.controller === ctx.controller).map((u) => u.id)
      if (!allies.length) return
      ctx.ask({ kind: 'chooseTargets', title: 'Which ally takes the Fox\'s cover?', data: { candidates: allies, count: 1, upTo: false, kind: 'unit', notTargeted: true } }, 'cover', { cardId })
    },
  }],
  conts: {
    cover: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const ally = typeof id === 'string' ? ctx.state.units[id] : undefined
      const p = ctx.state.players[ctx.controller]
      const cardId = c.cardId as string
      if (!ally || ally.controller !== ctx.controller || !p.cemetery.includes(cardId)) return
      p.cemetery.splice(p.cemetery.indexOf(cardId), 1)
      if (!p.banished.includes(cardId)) p.banished.push(cardId)
      ctx.grantKeyword(ally.id, 'stealth', 'permanent')
      ctx.grantKeyword(ally.id, 'undisableable', 'permanent')
      ctx.log(`Arctic Fox is banished: ${ally.name} gains Stealth and can't be disabled.`)
    },
  },
})
