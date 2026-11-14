import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Has Charge if there are Bears or sites in your cemetery.'
// "Bears" has no subtype behind it: it is read off the card's name (Polar Bears, Bearserker; the Druid's
// Bruin is a bear too).
const isBear = (name: string) => /\bbears?\b/i.test(name) || name === 'Bearserker' || name === 'Bruin'

registerScript('Nanurluk', {
  selfGrantOnly: true,
  selfKeywords: (state, self) => {
    const fed = state.players[self.controller].cemetery.some((id) => {
      const name = state.cards[id]?.name
      return !!name && (isBear(name) || getCard(name).type === 'Site')
    })
    return fed ? ['charge'] : []
  },
})
