import { registerScript } from '../registry'
import { terrainAt } from '../../../engine/statics'
import { connected } from '../multi-card-utils/connected'

// 'Burrowing / Has +1 power for each site in their span of land.'
// A span of land is the contiguous group of adjacent land sites they stand on (or under), whoever
// controls them (Codex). Off land — in the void or on water — they have no span.
registerScript('Myrmidons', {
  selfPower: (state, self) => {
    if (self.region === 'void') return 0
    return connected(state, self.x, self.y, (x, y) => terrainAt(state, x, y) === 'land').length
  },
})
