import { getScript } from '../packages/shared/src/cards/scripts/registry'
import { getCard } from '../packages/shared/src/cards/db'
import '../packages/shared/src/cards/scripts/index'

const names = `Abyssal Assault, Apply Alkahest, Backstab, Baptize, Begone!, Betrayal, Bind Evil, Blaze, Blaze of Glory, Blink, Boil, Bone Spear, Buried Alive, Burning Hands, Bury, Call of the Sea, Cast into Exile, Cave-In, Chaos Twister, Consecrate, Craterize, Degradation, Desecrate, Disintegrate, Displace, Divine Lance, Dream-Quest, Dredge, Drown, Duel, Enduring Faith, Exhume, Extinguish, Fade, Fatality, Feign Death, Fire Harpoons!, Firebreathing, Flanking Maneuver, Four Fat Frogs, Freeze, Geyser, Gift of the Frog, Gift of the Raven, Gift of the Serpent, Gift of the Wolf, Grievous Insult, Harpyon Urge, Harvest Festival, Immolation, Infiltrate, Into the Abyss, Joust!, Kiss of Death, Lash, Leap Attack, Lure, Mesmerism, Meteor Shower, Monstermorphosis, Necropotence, Pollimorph, Power of Flight, Raze, Riptide, Satanic Panic, Second Wind, Shapeshift, Shatter Strike, Sleep, Smite, Spin Attack, Stone Rain, Stormy Seas, Telekinesis, Teleport, Trial by Fire, Trial by Water, Upwelling, Warp Spasm, Wave of Eviction, Whirling Blades, Awakened Mummies, Dormant Monstrosity, Drowned, Entombed, Evil Twin, Forsaken, Hearkening Kraken, Lugbog Cat, The Hexham Haunts, The Ninth Legion, Weathered Trunks`.split(', ')

for (const n of names) {
  const s: any = getScript(n)
  const c: any = getCard(n)
  const keys = s ? Object.keys(s) : []
  const th = c?.thresholds ? Object.entries(c.thresholds).filter(([, v]: any) => v > 0).map(([k, v]) => `${k}${v}`).join('') : ''
  console.log(`\n### ${n} [${c?.type}] ${th} kw=${(c?.keywords || []).join('/')} sub=${(c?.subtypes || []).join('/')}`)
  console.log('  scriptKeys:', keys.join(','))
  if (s?.targets) console.log('  targets:', JSON.stringify(s.targets))
  if (c?.text) console.log('  text:', c.text.replace(/\n/g, ' '))
}
