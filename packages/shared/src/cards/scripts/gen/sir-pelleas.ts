import { registerScript } from '../registry'
import { getCard } from '../../db'
import { siteAt } from '../../../engine/grid'

// 'Submerge / Moves freely between water locations.'
registerScript('Sir Pelleas', {
  freeStep: (state, _unit, from, to) => {
    const isWater = (x: number, y: number) => {
      const s = siteAt(state, x, y)
      return !!s && (s.flooded || getCard(s.name).thresholds.water > 0)
    }
    return isWater(from.x, from.y) && isWater(to.x, to.y)
  },
})
