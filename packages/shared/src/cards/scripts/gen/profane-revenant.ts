import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Has 0 power unless adjacent to an Evil ally.'
registerScript('Profane Revenant', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    const evilFriend = Object.values(state.units).some(
      // an adjacent Evil ALLY — region-locked to the source; an Evil allied AVATAR counts too
      (u) => u.id !== self.id && u.controller === self.controller && u.region === self.region &&
        Math.abs(u.x - self.x) + Math.abs(u.y - self.y) <= 1 && isEvilU(state, u),
    )
    return evilFriend ? 0 : -(getCard(self.name).attack ?? 0)
  },
})
