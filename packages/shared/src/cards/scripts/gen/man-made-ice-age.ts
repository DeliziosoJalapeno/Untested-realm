import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// 'Minions and artifacts atop affected sites are disabled.'
// "Atop": on the surface of a site the aura covers (not beneath it, not over the void). A disabled
// artifact has no abilities (Codex) — the same as one that has lost its text.
registerScript('Man-made Ice Age', {
  auraDisablesUnit: (state, aura, unit) => {
    if (unit.isAvatar || unit.region !== 'surface') return false
    return aura.squares.some((s) => s.x === unit.x && s.y === unit.y) && !!siteAt(state, unit.x, unit.y)
  },
  auraSilencesArtifacts: true,
})
