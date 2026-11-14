import { registerScript, getScript } from '../registry'
import { GRID_H, siteAt } from '../../../engine/grid'
import { enterSite } from '../../../engine/casting'
import { pushLog, siteCantBeMoved, toCemetery } from '../../../engine/effects'

// "Replace sites in this column with ones from the top of their controller's atlas, starting at your
// back row going forwards."
// "This column" is the caster's. Each site there, back to front, is replaced by the top site of its own
// controller's atlas: the old one goes to its owner's cemetery, the new one enters in its place (its
// Genesis and all) under the same controller, and what stood on the site stays. A Trap from the atlas
// goes down face-down, unrevealed (FAQ). A site whose controller has no atlas left, Rubble, and a site
// that can't be modified (Bedrock) stay as they are.
registerScript('Terraform', {
  onCast: (ctx) => {
    const col = ctx.caster?.x
    if (col === undefined) return
    const rows = Array.from({ length: GRID_H }, (_, i) => (ctx.controller === 0 ? i : GRID_H - 1 - i))
    let replaced = 0
    for (const y of rows) {
      const old = siteAt(ctx.state, col, y)
      if (!old || old.isRubble || old.controller === null) continue
      if (getScript(old.name)?.unmodifiableSite || siteCantBeMoved(ctx.state, old)) continue
      const who = old.controller
      const atlas = ctx.state.players[who].atlas
      if (!atlas.length) continue
      const cardId = atlas.shift()!
      const oldName = old.trap ? 'a face-down site' : old.name
      delete ctx.state.sites[old.id]
      toCemetery(ctx.state, old.cardId)
      pushLog(ctx.state, ctx.controller, `Terraform: ${oldName} is replaced from the top of ${ctx.state.players[who].name}'s atlas.`)
      enterSite(ctx.state, who, cardId, col, y)
      replaced++
    }
    if (!replaced) ctx.log('Terraform finds nothing to replace in this column.')
  },
})
