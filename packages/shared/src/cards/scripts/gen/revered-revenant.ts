import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Has 0 power unless adjacent to an allied Ward.'
registerScript('Revered Revenant', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    const warded = Object.values(state.units).some(
      // adjacent minion is region-locked to the source
      (u) => u.controller === self.controller && u.ward && u.region === self.region && Math.abs(u.x - self.x) + Math.abs(u.y - self.y) <= 1,
    )
    return warded ? 0 : -(getCard(self.name).attack ?? 0)
  },
})
