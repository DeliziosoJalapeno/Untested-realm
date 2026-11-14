import { registerScript } from '../registry'
import { orthAdjacentWrapped, siteAt, unitsAt } from '../../../engine/grid'
import { tapUnit } from '../../../engine/effects'
import { trapScript } from '../multi-card-utils/trap'
import type { GameState, SiteState } from '../../../engine/types'

// "Trap (1) → Tap minions at one adjacent site. They don't untap the next time they would."
// (Like Sir Tristan: a skipUntap counter the next untap consumes.) The released card says "one adjacent
// site" where the spoiler said "target": the site is chosen, not targeted — no Ward is broken, and the
// trap can be sprung even with no site beside it.
const beside = (state: GameState, site: SiteState): string[] =>
  orthAdjacentWrapped(state, site.x, site.y).map((q) => siteAt(state, q.x, q.y)).filter((s) => !!s).map((s) => s!.id)

registerScript('Deep Snow', trapScript({
  label: 'tap the minions at an adjacent site; they stay tapped',
  mana: 1,
  effect: (ctx, site) => {
    const ids = beside(ctx.state, site)
    if (!ids.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Deep Snow: bury which adjacent site?', data: { candidates: ids, count: 1, kind: 'site', notTargeted: true } }, 'snow')
  },
  conts: {
    snow: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const trap = ctx.state.sites[ctx.sourceId]
      const target = typeof id === 'string' ? ctx.state.sites[id] : undefined
      if (!trap || !target || !beside(ctx.state, trap).includes(target.id)) return
      for (const u of unitsAt(ctx.state, target.x, target.y)) {
        if (u.isAvatar || u.region === 'void') continue
        tapUnit(ctx.state, u) // through the tap hook (False Idol)
        u.counters = { ...u.counters, skipUntap: 1 }
      }
      ctx.log(`Deep snow buries ${target.name}.`)
    },
  },
}))
