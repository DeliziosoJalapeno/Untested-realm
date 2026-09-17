import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Anyone may cast Knights, Sirs, or Dames to this site and may do so for no threshold.'
registerScript('Tournament Grounds', {
  siteAllowsAnySummon: (_state, _site, _player, cardName) =>
    /\b(Knight|Sir|Dame)\b/.test(cardName) || getCard(cardName).subtypes.includes('Knight'),
  knightsNeedNoThresholdHere: true,
})
