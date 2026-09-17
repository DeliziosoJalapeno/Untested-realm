import { registerScript } from '../registry'

// ---------- area disable statics ----------

// 'Other minions at rest here or one step in front of Hillock Basilisk are disabled.'
registerScript('Hillock Basilisk', {
  disablesOnlyAtRest: true,
  disablesOther: (state, selfId, unit) => {
    const self = state.units[selfId]
    if (!self || unit.isAvatar || unit.id === selfId) return false
    const front = self.controller === 0 ? self.y + 1 : self.y - 1
    const here = unit.x === self.x && unit.y === self.y && unit.region === self.region
    const ahead = unit.x === self.x && unit.y === front && unit.region === 'surface'
    return here || ahead
  },
})
