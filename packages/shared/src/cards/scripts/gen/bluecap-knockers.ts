import { registerScript } from '../registry'

// "Burrowing / Bluecap Knockers' site can't be moved, destroyed, or modified."
registerScript('Bluecap Knockers', {
  protectsSite: (state, self, site) => site.x === self.x && site.y === self.y,
})
