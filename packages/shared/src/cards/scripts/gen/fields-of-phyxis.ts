import { registerScript } from '../registry'

// 'The site directly in front is silenced.'
registerScript('Fields of Phyxis', {
  silencesSiteAt: (state, self, target) => {
    if (self.controller === null) return false
    const front = self.controller === 0 ? self.y + 1 : self.y - 1
    return target.x === self.x && target.y === front
  },
})
