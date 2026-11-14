import { registerScript } from '../registry'
import { surfaceSweepPath, carryAlongPath } from '../multi-card-utils/surface-sweep'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'

// 'Choose any number of allied sites. Snow rolls forward from them, picking up surface units in its
// path and carrying them as far as possible. When it stops, they take 3 damage and are disabled until
// your next turn.'
// Each chosen site sends snow forward (toward the opponent) like an Avalanche. FAQ: snow that can't move
// at all never "stops", so it hurts nobody; a unit that didn't end up where its snow stopped (it couldn't
// be moved, or couldn't enter a site on the way) isn't affected; and a unit caught by several snows takes
// the 3 damage once, all of it dealt together after every snow has stopped.
registerScript('When the Peaks Fell', {
  onCast: (ctx) => {
    const sites = Object.values(ctx.state.sites).filter((s) => s.controller === ctx.controller && !s.isRubble).map((s) => s.id)
    if (!sites.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'When the Peaks Fell — snow rolls forward from which of your sites?', data: { candidates: sites, count: sites.length, upTo: true, kind: 'site', notTargeted: true } }, 'peaks')
  },
  conts: {
    peaks: (ctx, _c, choice) => {
      const ids = (Array.isArray(choice) ? choice : choice ? [choice] : []).filter((id): id is string => typeof id === 'string')
      const forward = ctx.controller === 0 ? 1 : -1
      const buried = new Set<string>()
      // front-most first, so snow from behind doesn't re-carry what the snow ahead already moved
      const chosen = ids.map((id) => ctx.state.sites[id]).filter((s) => !!s && s.controller === ctx.controller)
        .sort((a, b) => (b!.y - a!.y) * forward)
      for (const site of chosen) {
        const path = surfaceSweepPath(ctx.state, { x: site!.x, y: site!.y }, { dx: 0, dy: forward }, false)
        if (path.length < 2) continue // it never moved, so it never stops
        const end = path[path.length - 1]
        for (const u of carryAlongPath(ctx, path)) {
          if (u.x === end.x && u.y === end.y && u.region === 'surface') buried.add(u.id)
        }
      }
      const hit = [...buried].filter((id) => !!ctx.state.units[id])
      for (const id of hit) ctx.dealDamage({ unit: id }, 3)
      for (const id of hit) disableUntilYourNextTurn(ctx.state, id, ctx.controller)
      ctx.log(`🏔 The peaks fall: ${hit.length} unit${hit.length === 1 ? ' is' : 's are'} buried in snow.`)
    },
  },
})
