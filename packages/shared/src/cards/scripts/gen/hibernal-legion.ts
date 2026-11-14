import { registerScript } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'

// "At the end of your turn, freeze this site and other minions here. They're disabled until the Legion
// leaves the realm."
// flow.hibernal records what each Legion has frozen; isDisabled / siteDisabled (statics.ts) read it and
// ignore a record whose Legion is no longer in the realm, so the thaw needs no trigger of its own.
registerScript('Hibernal Legion', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.region === 'void') return
    const flow = (ctx.state.flow = ctx.state.flow ?? {})
    type Frozen = { legionId: string; units: string[]; sites: string[] }
    const all = ((flow.hibernal ?? []) as Frozen[]).filter((h) => !!ctx.state.units[h.legionId])
    let mine = all.find((h) => h.legionId === self.id)
    if (!mine) { mine = { legionId: self.id, units: [], sites: [] }; all.push(mine) }
    const site = siteAt(ctx.state, self.x, self.y)
    if (site && !site.isRubble && !mine.sites.includes(site.id)) mine.sites.push(site.id)
    const caught = unitsAt(ctx.state, self.x, self.y, self.region).filter((u) => !u.isAvatar && u.id !== self.id && !mine!.units.includes(u.id))
    for (const u of caught) mine.units.push(u.id)
    flow.hibernal = all
    if (site || caught.length) ctx.log(`❄ The Hibernal Legion freezes ${site ? site.name : 'the ground'}${caught.length ? ` and ${caught.length} minion${caught.length === 1 ? '' : 's'} there` : ''}.`)
  },
})
