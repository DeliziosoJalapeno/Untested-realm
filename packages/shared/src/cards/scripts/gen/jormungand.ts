import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// "Occupies all outer locations safely, and can't be modified."
// The card prints the ring: every square on the outside of the realm. Like Yog-Sothoth's, the footprint
// is a characteristic that checkStateBased applies from the card's name (occupiesAllLocations.outerOnly).
// "Safely": it lies over land, water and void alike — and, girding the whole realm, has nowhere to move.
registerScript('Jormungand', {
  occupiesAllLocations: { outerOnly: true },
  unmodifiable: true,
  selfKeywords: () => ['voidwalk', 'submerge', 'burrowing', 'immobile'],
  genesis: (ctx) => {
    if (ctx.state.units[ctx.sourceId]) pushLog(ctx.state, ctx.controller, '🐍 Jormungand girds the realm: it occupies every outer location.')
  },
})
