import { registerScript } from '../registry'
import { getCard } from '../../db'

// "You may play this to replace any player's Elite or Unique site, under their control."
registerScript('Heirloom Lost', {
  mayReplaceSite: (_state, _player, site) => {
    const r = getCard(site.name).rarity
    return r === 'Elite' || r === 'Unique'
  },
  replacedSiteIsBanished: true, // FAQ: the replaced site is banished
})
