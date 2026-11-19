// Candidate Frost Mage and Lavamancer builds for the post-release meta. See gauntlet.ts.
import type { DeckList } from '../../packages/shared/src'

const FROST_COLLECTION = { 'Arc Lightning': 1, Blizzard: 1, Disenchant: 1, Displace: 1, Drown: 1, 'Highland Clansmen': 1, 'Ice Shards': 1, 'Lightning Bolt': 1, 'Plumed Pegasus': 1, 'Tufted Turtles': 1 }
const LAVA_COLLECTION = { 'Amazon Warriors': 1, Boil: 1, Bury: 1, Dispel: 1, 'Gift of the Serpent': 1, "Hamlet's Ablaze!": 1, 'Heat Ray': 1, Hellhounds: 2, 'Rolling Boulder': 1 }

const FROST_ATLAS = {
  Tundra: 2, Lighthouse: 3, 'Lone Tower': 1, 'Dark Tower': 1, 'Gothic Tower': 1, 'Wuthering Heights': 2, 'Troll Bridge': 3, 'River Rapids': 2,
  'Icicle Dome': 2, Avalanche: 2, 'Deep Snow': 2, Permafrost: 2, 'Springstem Meadow': 1, Stream: 4, Spire: 2,
}
const LAVA_ATLAS = {
  Scoria: 2, Steppe: 3, 'Fertile Earth': 3, 'Gnome Hollows': 3, 'Boulevard of Bones': 2, 'Red Desert': 4, 'Vast Desert': 2,
  'Spike Trap': 3, 'Sulfur Vents': 2, 'Humming Hummocks': 2, 'Smoldering Hollow': 2, 'Trapper\'s Rest': 2,
}

export const DECKS: Record<string, DeckList> = {
  // F1: cheap disable + one-mana kills. Encase or Frostbolt a minion, then Shatter / Aria Wraith / Icicle Dome it.
  'F1 Shatterfreeze': {
    name: 'F1 Shatterfreeze', avatar: 'Frost Mage', collection: FROST_COLLECTION, atlas: FROST_ATLAS,
    spellbook: {
      'Arctic Fox': 3, Runeling: 3, 'Jussi Puffins': 3, 'Sissi Marksmen': 3, 'The White Death': 1, 'Aria Wraith': 2, 'Lone Wolf': 3,
      'Lugbog Cat': 3, 'Coy Nixie': 3, 'Headless Haunt': 3, 'Frost Elemental': 3, Hailstriker: 2, 'A Yeti So Shy': 2, 'Abaddon Succubus': 2,
      'Gyre Hippogriffs': 2, 'Full-tilt Goliaths': 2,
      Shatter: 3, Frostbolt: 3, Slide: 3, 'Frost Breath': 2, 'Whirling Blades': 3,
      Toolbox: 3, 'Ring of Morrigan': 1, 'Amethyst Core': 1, 'Aquamarine Core': 1,
    },
  },
  // F2: the proven Air/Water bodies from the current meta, with the Frost Mage's disable package on top.
  'F2 Frost Goodstuff': {
    name: 'F2 Frost Goodstuff', avatar: 'Frost Mage', collection: FROST_COLLECTION, atlas: FROST_ATLAS,
    spellbook: {
      'Adept Illusionist': 2, 'Jussi Puffins': 3, 'Lugbog Cat': 3, 'Coy Nixie': 3, 'Order of the Sacred Oak': 3, 'Headless Haunt': 3,
      'Gibbous Nightgaunts': 3, Sturmgeist: 2, 'Abaddon Succubus': 2, 'Sacred Stag': 2, 'Ruler of Thul': 1, 'Frost Elemental': 3,
      Hailstriker: 2, 'Gyre Hippogriffs': 3, 'Daperyll Vampire': 2, 'The Green Knight': 1, 'Grandmaster Wizard': 1, 'Full-tilt Goliaths': 1,
      Shatter: 3, Frostbolt: 3, 'Whirling Blades': 3, Riptide: 3, Mesmerism: 1, 'Atlantean Fate': 1,
      Toolbox: 3, 'Ring of Morrigan': 1, 'Amethyst Core': 1, 'Aquamarine Core': 1,
    },
  },
  // F3: Permafrost lock. Disable effects on a Permafrost site never wear off; big frozen board, late finishers.
  'F3 Permafrost Lock': {
    name: 'F3 Permafrost Lock', avatar: 'Frost Mage', collection: FROST_COLLECTION,
    atlas: { ...FROST_ATLAS, 'Thin Ice': 2, Spire: 0 },
    spellbook: {
      'Arctic Fox': 3, 'Highgate Guide': 3, 'Jussi Puffins': 3, 'Coy Nixie': 3, 'Lugbog Cat': 3, 'Order of the Sacred Oak': 3, 'Frost Elemental': 3,
      Hailstriker: 2, 'Stomping Mammoth': 3, 'Swealand Longship': 2, 'Aria Wraith': 2, 'Hibernal Legion': 2, Nanurluk: 1, Jormungand: 1,
      'Full-tilt Goliaths': 2, 'Abaddon Succubus': 2, 'Sacred Stag': 2,
      Shatter: 3, Frostbolt: 3, 'Frost Breath': 3, Slide: 2, Research: 3, 'When the Peaks Fell': 1, 'Man-made Ice Age': 1, 'Polar Shift': 1,
      Toolbox: 3,
    },
  },

  // L1: Earth/Fire aggro with the best cheap bodies of the meta, Lava Elementals and Ground Slam.
  'L1 Lava Aggro': {
    name: 'L1 Lava Aggro', avatar: 'Lavamancer', collection: LAVA_COLLECTION, atlas: LAVA_ATLAS,
    spellbook: {
      'Vile Imp': 4, 'War Horse': 3, 'Kettletop Leprechaun': 4, 'Snapjaw Raptor': 3, 'Emberleaf Dryad': 2, 'Quarrelsome Kobolds': 3,
      'Redcap Powries': 3, 'Root Spider': 3, 'Autumn Unicorn': 3, 'Saracen Raiders': 3, 'Lava Elemental': 3, 'Pudge Butcher': 3,
      Gargantula: 2, 'Monstrous Lion': 2, 'Slag Slug': 2, 'Archangel Michael': 1,
      Earthquake: 2, Landmass: 3, 'Common Sense': 3, 'Ground Slam': 2, Onslaught: 2,
      Toolbox: 3, 'Ring of Morrigan': 1,
    },
  },
  // L2: burrowers under a burning surface. Root Spider, Pass-plug Serpent and Myrmidons sit underground while
  // None Survive the Sun, Supervolcano, Krakalak and the traps clear what walks on top.
  'L2 Burrow and Burn': {
    name: 'L2 Burrow and Burn', avatar: 'Lavamancer', collection: LAVA_COLLECTION,
    atlas: { Scoria: 2, Steppe: 3, 'Fertile Earth': 3, 'Gnome Hollows': 2, 'Red Desert': 4, 'Spike Trap': 4, 'Sulfur Vents': 3, 'Volcanic Eruption': 3, 'Combusting Busts': 2, "Trapper's Rest": 2, Supervolcano: 1, 'Humming Hummocks': 1 },
    spellbook: {
      'Vile Imp': 4, 'Kettletop Leprechaun': 4, 'Root Spider': 3, 'Reed Cord Measurer': 3, 'Emberleaf Dryad': 2, 'Quarrelsome Kobolds': 3,
      'Gnarled Laborers': 3, 'Pass-plug Serpent': 2, 'Stiff-pitch Witch': 2, 'Lava Elemental': 3, 'Southpaw Dyrodor': 3,
      Gargantula: 2, "Tusslin' Trolls": 2, Myrmidons: 2, 'King Krakalak': 1, 'Death Dealer': 1,
      Earthquake: 2, Landmass: 3, Chart: 3, 'Ground Slam': 3, 'Major Explosion': 2, 'Rite of Eruption': 1, 'None Survive the Sun': 1,
      Toolbox: 3, 'Onyx Core': 1, 'Ruby Core': 1,
    },
  },
  // L3: land ramp. Extra site plays every turn into Myrmidons, Atlas Wanderers and Earthquake.
  'L3 Lava Ramp': {
    name: 'L3 Lava Ramp', avatar: 'Lavamancer', collection: LAVA_COLLECTION,
    atlas: LAVA_ATLAS,
    spellbook: {
      'Kettletop Leprechaun': 4, 'Frontier Settlers': 3, 'Reed Cord Measurer': 3, 'Emberleaf Dryad': 2, 'Vile Imp': 4, 'Root Spider': 3,
      'Autumn Unicorn': 3, 'Lava Elemental': 3, 'Pudge Butcher': 3, Gargantula: 2, 'Southpaw Dyrodor': 1,
      'Atlas Wanderers': 2, Myrmidons: 2, 'Archangel Michael': 1, 'Infernal Legion': 2,
      Chart: 4, Landmass: 4, 'Ash of Effort': 2, Earthquake: 2, 'Common Sense': 3, 'Ground Slam': 2,
      Toolbox: 3, 'Onyx Core': 1, 'Ruby Core': 1,
    },
  },

  // ---------- round 2 ----------
  // F4: F2 with the clunky top end cut for more cheap plays and the Slide / Aria Wraith disable synergy.
  'F4 Frost Tempo': {
    name: 'F4 Frost Tempo', avatar: 'Frost Mage', collection: FROST_COLLECTION, atlas: FROST_ATLAS,
    spellbook: {
      'Arctic Fox': 3, 'Adept Illusionist': 2, 'Jussi Puffins': 3, 'Lugbog Cat': 3, 'Coy Nixie': 3, 'Order of the Sacred Oak': 3, 'Headless Haunt': 3,
      'Gibbous Nightgaunts': 3, Sturmgeist: 2, 'Aria Wraith': 2, 'Abaddon Succubus': 2, 'Sacred Stag': 2, 'Ruler of Thul': 1, 'Frost Elemental': 3,
      Hailstriker: 2, 'Gyre Hippogriffs': 3, 'Full-tilt Goliaths': 1,
      Shatter: 3, Frostbolt: 3, Slide: 3, 'Whirling Blades': 3, Riptide: 2,
      Toolbox: 3, 'Ring of Morrigan': 1, 'Amethyst Core': 1,
    },
  },
  // F5: Air first. Stealth and evasion bodies, Water only through Tundra / Lighthouse for the Frost package.
  'F5 Frost Air Stealth': {
    name: 'F5 Frost Air Stealth', avatar: 'Frost Mage', collection: FROST_COLLECTION,
    atlas: { Tundra: 2, Lighthouse: 3, 'Lone Tower': 1, 'Dark Tower': 1, 'Gothic Tower': 1, 'Wuthering Heights': 2, 'Icicle Dome': 2, Avalanche: 2, 'Deep Snow': 3, 'Springstem Meadow': 2, 'Mountain Pass': 2, 'Troll Bridge': 2, Spire: 4, Stream: 3 },
    spellbook: {
      'Arctic Fox': 3, 'The White Death': 1, 'Highland Princess': 1, 'Sissi Marksmen': 3, 'Lone Wolf': 3, 'Headless Haunt': 3, 'Gibbous Nightgaunts': 3,
      'Phase Assassin': 3, 'Stygian Archers': 3, Sturmgeist: 2, 'Aria Wraith': 2, 'A Yeti So Shy': 2, 'Gyre Hippogriffs': 3, 'Frost Elemental': 3,
      Hailstriker: 2, 'Daperyll Vampire': 3, 'Full-tilt Goliaths': 2,
      Shatter: 3, Frostbolt: 3, Blink: 2, Slide: 2, 'Whirling Blades': 3,
      Toolbox: 3, 'Ring of Morrigan': 1, 'Amethyst Core': 1,
    },
  },
  // F6: Water first. Lures, wards and big water bodies behind the freeze.
  'F6 Frost Water': {
    name: 'F6 Frost Water', avatar: 'Frost Mage', collection: FROST_COLLECTION,
    atlas: { Tundra: 2, Lighthouse: 3, 'Troll Bridge': 3, 'River Rapids': 2, Permafrost: 2, 'Thin Ice': 2, 'Lone Tower': 1, 'Dark Tower': 1, 'Wuthering Heights': 2, 'Icicle Dome': 2, 'Deep Snow': 2, Stream: 4, 'Winter River': 4 },
    spellbook: {
      'Adept Illusionist': 2, 'Polar Explorers': 2, 'Jussi Puffins': 3, 'Lugbog Cat': 3, 'Coy Nixie': 3, 'Order of the Sacred Oak': 3, 'Abaddon Succubus': 2,
      'Sacred Stag': 2, 'Ruler of Thul': 1, 'Stomping Mammoth': 3, 'Swealand Longship': 3, 'Frost Elemental': 3, Hailstriker: 2, 'Lacuna Entity': 2,
      Bearserker: 2, 'The Green Knight': 1, Nanurluk: 1, 'Hibernal Legion': 1,
      Riptide: 3, Overflow: 3, Frostbolt: 3, Shatter: 3, 'Frost Breath': 2, Mesmerism: 1, 'Atlantean Fate': 1,
      Toolbox: 3, 'Ring of Morrigan': 1, 'Aquamarine Core': 1,
    },
  },
  // L4: Earth first, Fire only where one F is enough. Efficient Earth bodies, Ward, and the Lava Elementals.
  'L4 Lava Earth': {
    name: 'L4 Lava Earth', avatar: 'Lavamancer', collection: LAVA_COLLECTION,
    atlas: { Scoria: 2, Steppe: 3, 'Fertile Earth': 3, 'Gnome Hollows': 3, 'Boulevard of Bones': 2, 'Common Village': 4, 'Spike Trap': 4, 'Humming Hummocks': 2, "Trapper's Rest": 2, Landslide: 2, 'Red Desert': 3 },
    spellbook: {
      'Kettletop Leprechaun': 4, 'Bosk Troll': 4, 'Vile Imp': 4, 'Sister Stefánia': 1, 'Arjaro Exorcist': 2, 'Root Spider': 3, 'Autumn Unicorn': 3,
      'Order of the White Wing': 3, 'Reed Cord Measurer': 3, 'Sunspear Tribe': 2, 'Quarrelsome Kobolds': 3, 'Pudge Butcher': 3, 'Southpaw Dyrodor': 3,
      Gargantula: 2, 'Pass-plug Serpent': 2, 'Stiff-pitch Witch': 2, "Tusslin' Trolls": 2, 'Archangel Michael': 1,
      Earthquake: 2, Landmass: 3, 'Common Sense': 3, 'Gift of the Wolf': 1,
      Toolbox: 3, 'Ring of Morrigan': 1,
    },
  },
  // L5: Fire first. Charge and cheap burn bodies, traps that ping, a few big finishers.
  'L5 Lava Fire': {
    name: 'L5 Lava Fire', avatar: 'Lavamancer', collection: LAVA_COLLECTION,
    atlas: { Scoria: 2, Steppe: 3, 'Red Desert': 4, 'Vast Desert': 4, 'Smoldering Hollow': 2, 'Sulfur Vents': 4, 'Volcanic Eruption': 3, 'Combusting Busts': 2, 'Molten Maar': 2, Supervolcano: 1, Wasteland: 3 },
    spellbook: {
      'Vile Imp': 4, 'Wild Fanatic': 4, 'Namira Cheetah': 4, 'War Horse': 3, 'Snapjaw Raptor': 3, 'Quarrelsome Kobolds': 3, 'Redcap Powries': 3,
      'Colicky Dragonettes': 3, 'Dust Devil': 3, 'Gnarled Laborers': 3, 'Saracen Raiders': 3, 'Monstrous Lion': 2, 'Màzuj Ifrit': 2, 'Slag Slug': 2,
      'Infernal Legion': 2, 'Death Dealer': 1, 'Balor of the Evil Eye': 1,
      Infiltrate: 2, 'Blaze of Glory': 1, 'Major Explosion': 2, Fireball: 3, 'Flametongue Newt': 1,
      Toolbox: 3, 'Ring of Morrigan': 1, 'Ruby Core': 1,
    },
  },
}

// F8: Frost Mage in Earth/Water. The Avatar's freeze needs two Air and two Water, and this deck plays no Air
// spells to speak of: Tundra makes Air equal Water, and Lighthouse, Windmill and Icicle Dome carry the rest.
// Earth brings the bodies and its own disables (Gargantula's cocoon, Root Spider); Permafrost makes any of
// them permanent; Shatter and Icicle Dome kill what is frozen.
DECKS['F8 Frost Earth-Water'] = {
  name: 'F8 Frost Earth-Water', avatar: 'Frost Mage',
  collection: { Drown: 1, 'Ice Shards': 1, 'Tufted Turtles': 1, Bury: 1, Dispel: 1, 'Gift of the Serpent': 1, 'Amazon Warriors': 1, Disenchant: 1, Blizzard: 1, Displace: 1 },
  atlas: { Tundra: 2, Lighthouse: 3, Windmill: 3, Aqueduct: 3, 'Icicle Dome': 2, Permafrost: 2, 'Troll Bridge': 3, 'Fertile Earth': 3, 'Gnome Hollows': 3, 'Common Village': 2, Stream: 2, Valley: 2 },
  spellbook: {
    'Kettletop Leprechaun': 4, 'Bosk Troll': 2, 'Root Spider': 3, 'Autumn Unicorn': 3, 'Lugbog Cat': 3, 'Coy Nixie': 3, 'Order of the Sacred Oak': 3,
    'Order of the White Wing': 3, 'Pudge Butcher': 3, 'Stomping Mammoth': 3, 'Abaddon Succubus': 2, 'Sacred Stag': 2, Gargantula: 2, 'Southpaw Dyrodor': 2,
    'Ruler of Thul': 1, 'Sister Stefánia': 1,
    Shatter: 3, 'Frost Breath': 2, Landmass: 3, Overflow: 2, 'Common Sense': 3, Earthquake: 2, Riptide: 2,
    Toolbox: 3,
  },
}

// U0: the user's own list (a modified Frost Mage precon), as the baseline for F9.
DECKS['U0 User Frost'] = {
  name: 'U0 User Frost', avatar: 'Frost Mage',
  collection: { Blizzard: 1, Disenchant: 1, Displace: 1, 'Lightning Bolt': 1, Drown: 1, 'Ice Shards': 1, 'Plumed Pegasus': 1, 'Tufted Turtles': 1, 'Arc Lightning': 1, 'Highland Clansmen': 1 },
  atlas: { 'Ancient Thaw': 2, Avalanche: 1, 'Deep Sea': 2, 'Deep Snow': 2, 'Icicle Dome': 2, Lighthouse: 2, 'Mountain Pass': 2, 'Mountain Peaks': 2, Permafrost: 2, 'River Rapids': 1, 'Springstem Meadow': 2, 'Thin Ice': 3, Tundra: 2, 'Winter River': 4, 'Wuthering Heights': 1 },
  spellbook: {
    'Arctic Fox': 1, 'Highgate Guide': 3, 'Jussi Puffins': 2, Runeling: 3, 'Sissi Marksmen': 2, 'The White Death': 1, 'Aria Wraith': 2, 'A Yeti So Shy': 1, 'Coy Nixie': 2,
    'Fey Changeling': 1, 'Lone Wolf': 1, 'Polar Bears': 4, 'Failed Mutation': 1, 'Frost Elemental': 3, Hailstriker: 2, 'Stomping Mammoth': 2, 'Swealand Longship': 1,
    Bearserker: 2, 'Frozen Horror': 2, 'Hibernal Legion': 1, Nanurluk: 1, 'Full-tilt Goliaths': 1, Jormungand: 1,
    Shatter: 3, Slide: 2, Frostbolt: 3, 'Polar Shift': 1, Research: 2, 'Frost Breath': 2, Snowball: 2, 'When the Peaks Fell': 1, 'Call of the Sea': 1,
    'Man-made Ice Age': 1, Toolbox: 2,
  },
}
// F9: the same deck rebuilt around its three ideas. Freeze first (Freeze, Frostbolt, Frost Elemental,
// Hailstriker, Hyperparasite, the Avatar), kill what is frozen for 1 (Shatter, Aria Wraith, Icicle Dome),
// shoot from range (Sissi Marksmen, Stygian Archers, The White Death, Hailstriker), then land the big bodies.
DECKS['F9 Frost Control'] = {
  name: 'F9 Frost Control', avatar: 'Frost Mage',
  collection: { Blizzard: 1, Disenchant: 1, Displace: 1, 'Lightning Bolt': 1, Drown: 1, 'Ice Shards': 1, 'Ice Lance': 1, Sleep: 1, 'Arc Lightning': 1, 'Highland Clansmen': 1 },
  atlas: { Tundra: 2, Lighthouse: 3, 'Icicle Dome': 2, Permafrost: 2, 'Deep Snow': 2, Avalanche: 2, 'Wuthering Heights': 2, 'River Rapids': 1, 'Winter River': 4, 'Mountain Pass': 2, 'Springstem Meadow': 2, 'Thin Ice': 2, 'Deep Sea': 2, 'Mountain Peaks': 2 },
  spellbook: {
    Freeze: 4, Shatter: 3, Frostbolt: 3, Slide: 2, Research: 2,
    'Sissi Marksmen': 3, 'The White Death': 1, 'Stygian Archers': 3, Hailstriker: 2,
    'Arctic Fox': 3, Runeling: 2, 'Jussi Puffins': 2, 'Coy Nixie': 3, 'Gibbous Nightgaunts': 3, 'Aria Wraith': 2, 'Frost Elemental': 3, 'Abaddon Succubus': 2,
    Hyperparasite: 2, 'Stomping Mammoth': 2, 'Frozen Horror': 2,
    'Full-tilt Goliaths': 2, 'Lord of Lies': 2, 'Hibernal Legion': 1, Nanurluk: 1, Jormungand: 1, 'Draconian Bonekite': 1,
    Toolbox: 3,
  },
}

// F10: F9 with fewer narrow cards (two Freeze, no Research / Hyperparasite / Puffins) and sturdier Gothic bodies.
DECKS['F10 Frost Control B'] = {
  ...DECKS['F9 Frost Control'], name: 'F10 Frost Control B',
  spellbook: {
    Freeze: 2, Shatter: 3, Frostbolt: 3, Slide: 2,
    'Sissi Marksmen': 3, 'The White Death': 1, 'Stygian Archers': 3, Hailstriker: 2,
    'Arctic Fox': 3, Runeling: 2, 'Coy Nixie': 3, 'Gibbous Nightgaunts': 3, 'Order of the Sacred Oak': 3, 'Aria Wraith': 2, 'Frost Elemental': 3, 'Abaddon Succubus': 2,
    'Sacred Stag': 2, 'Lacuna Entity': 2, 'Stomping Mammoth': 3, 'Frozen Horror': 2,
    'Full-tilt Goliaths': 2, 'Lord of Lies': 2, 'Hibernal Legion': 1, Nanurluk: 1, Jormungand: 1, 'Draconian Bonekite': 1,
    Toolbox: 3,
  },
}
// F11: as F10 but with the strongest cheap Air/Water bodies from older sets.
DECKS['F11 Frost Control C'] = {
  ...DECKS['F9 Frost Control'], name: 'F11 Frost Control C',
  spellbook: {
    Freeze: 2, Shatter: 3, Frostbolt: 3, Slide: 2,
    'Sissi Marksmen': 3, 'The White Death': 1, 'Stygian Archers': 3, Hailstriker: 2,
    'Arctic Fox': 3, Runeling: 2, 'Coy Nixie': 3, 'Lugbog Cat': 3, 'Headless Haunt': 3, 'Gibbous Nightgaunts': 3, 'Aria Wraith': 2, 'Frost Elemental': 3, 'Abaddon Succubus': 2,
    'Sacred Stag': 2, 'Stomping Mammoth': 2, 'Frozen Horror': 2,
    'Full-tilt Goliaths': 2, 'Lord of Lies': 2, 'Hibernal Legion': 1, Nanurluk: 1, Jormungand: 1, 'Draconian Bonekite': 1,
    Toolbox: 3,
  },
}

// F12: F10 held to what the user owns (two sets of FvL, the Gothic precons, Arthurian Ordinary/Exceptional
// playsets, Beta and Gothic boxes: see owned.ts). No Gothic Elites or Uniques from boxes are assumed.
DECKS['F12 Frost Control (owned)'] = {
  ...DECKS['F9 Frost Control'], name: 'F12 Frost Control (owned)',
  spellbook: {
    Freeze: 2, Shatter: 3, Frostbolt: 3, Slide: 2, 'Whirling Blades': 2,
    'Sissi Marksmen': 3, 'The White Death': 1, 'Stygian Archers': 2, Hailstriker: 2,
    'Arctic Fox': 2, Runeling: 2, 'Coy Nixie': 3, 'Lugbog Cat': 3, 'Headless Haunt': 3, 'Gibbous Nightgaunts': 2, 'Order of the Sacred Oak': 2, 'Aria Wraith': 2, 'Frost Elemental': 3,
    'Gyre Hippogriffs': 2, 'Lacuna Entity': 1, 'Stomping Mammoth': 3, 'Frozen Horror': 2,
    'Full-tilt Goliaths': 2, 'Hibernal Legion': 2, Nanurluk: 1, Jormungand: 1, 'Draconian Bonekite': 1,
    Toolbox: 3,
  },
}

// Cold Snap: F12 with the user's own Elites and Uniques worked in (Ring of Morrigan with Highland Princess to
// find it, Pollimorph, Sacred Stag) and the Gothic Exceptionals back at three.
DECKS['Cold Snap'] = {
  ...DECKS['F9 Frost Control'], name: 'Cold Snap',
  spellbook: {
    Freeze: 2, Shatter: 3, Frostbolt: 3, Slide: 2, Pollimorph: 1,
    'Sissi Marksmen': 3, 'The White Death': 1, 'Stygian Archers': 3, Hailstriker: 2,
    'Arctic Fox': 2, 'Highland Princess': 1, 'Adept Illusionist': 2, 'Coy Nixie': 3, 'Lugbog Cat': 2, 'Headless Haunt': 2, 'Gibbous Nightgaunts': 3, 'Order of the Sacred Oak': 3, 'Aria Wraith': 2, 'Frost Elemental': 3,
    'Sacred Stag': 1, 'Lacuna Entity': 1, 'Stomping Mammoth': 3, 'Frozen Horror': 2,
    'Full-tilt Goliaths': 2, 'Hibernal Legion': 1, Nanurluk: 1, 'Seirawan Hydra': 1, 'Draconian Bonekite': 1,
    Toolbox: 3, 'Ring of Morrigan': 1,
  },
}

// L6 (control): the Fire Necromancer list with the Avatar swapped, to see what the Lavamancer costs a proven shell.
import { featuredDecks } from '../../packages/shared/src'
const necro = (featuredDecks as DeckList[]).find((d) => d.name === 'Fire Necromancer')
if (necro) DECKS['L6 Necro shell, Lavamancer'] = { ...necro, name: 'L6 Necro shell, Lavamancer', avatar: 'Lavamancer' }
const air = (featuredDecks as DeckList[]).find((d) => d.name === 'Avatar of Air')
if (air) DECKS['F7 Air shell, Frost Mage'] = { ...air, name: 'F7 Air shell, Frost Mage', avatar: 'Frost Mage' }
