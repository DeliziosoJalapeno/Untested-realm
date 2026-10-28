// Push, pull and drag cards (Codex, Forced Movement / Step / Void / Submerge):
//  · Whirlwind / Windblast push units and carriable artifacts — never a Monument; Windblast's steps are
//    simultaneous (a carried unit isn't blown twice) and wrap the edges under Magellan Globe.
//  · Gargantula cocoons, and Gloam Toads strike, only a minion the drag actually brought to them.
//  · Into the Abyss submerges (a forced submerge: Driftwood Marrows stops it) or pulls into the void the
//    caster chooses.
//  · Red Rock of Ravannis pulls each bearer one step, however many artifacts it carries; an artifact
//    whose bearer can't be pulled is pulled out of its hands; Monuments stay; Automatons are pulled.
//  · Rolling Boulder rolls on under Magellan Globe until it would repeat a step, stays in its region, and
//    deals its 4 damage once to each unit along its path.
//  · Darkest Dungeon drags both or neither.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, waiveThreshold, summonCard, castMagic, answer, act, placeSite, giveArtifact } from './helpers'
import { avatarOf, emitEvent, getScript, makeCtx, type ArtifactState, type GameState, type Region, type UnitState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame(); keepBoth(g); fillSites(g); waiveThreshold(g, 0)
  return g
}
/** a REAL artifact lying on the ground (not carried) */
function groundArtifact(g: GameState, name: string, x: number, y: number, region: Region = 'surface'): ArtifactState {
  const cardId = `ctest${g.nextId++}`
  g.cards[cardId] = { id: cardId, name, owner: 0 }
  const id = `atest${g.nextId++}`
  const art: ArtifactState = { id, cardId, name, conjuredBy: 0, x, y, region, carriedBy: null, tapped: false }
  g.artifacts[id] = art
  return art
}
const at = (p: { x: number; y: number }) => `${p.x},${p.y}`
const ready = (u: UnitState) => { u.enteredTurn = -1; u.tapped = false; return u }
const avatarsAside = (g: GameState) => {
  for (const p of [0, 1] as const) { const a = avatarOf(g, p); a.x = p * 4; a.y = 3; a.region = 'surface' }
}

describe('Whirlwind and Windblast never move a Monument', () => {
  it('Whirlwind spins the Ruby Core round the area, but the Red Rock of Ravannis stays put', () => {
    const g = board()
    const rock = groundArtifact(g, 'Red Rock of Ravannis', 1, 1)
    const core = groundArtifact(g, 'Ruby Core', 2, 2)
    castMagic(g, 0, 'Whirlwind')
    answer(g, { x: 1, y: 1 })
    answer(g, 'clockwise') // (1,1) → (1,2) → (2,2) → (2,1) → (1,1)
    expect(at(g.artifacts[core.id]), 'a carriable artifact is pushed').toBe('2,1')
    expect(at(g.artifacts[rock.id]), 'a Monument is not').toBe('1,1')
  })

  it('Windblast blows the Ruby Core a step east, but the Red Rock of Ravannis stays put', () => {
    const g = board()
    const rock = groundArtifact(g, 'Red Rock of Ravannis', 1, 1)
    const core = groundArtifact(g, 'Ruby Core', 3, 1)
    castMagic(g, 0, 'Windblast')
    answer(g, 'east')
    expect(at(g.artifacts[core.id])).toBe('4,1')
    expect(at(g.artifacts[rock.id])).toBe('1,1')
  })
})

describe('Windblast: every push is one simultaneous step', () => {
  it('a Bosk Troll carried by a War Horse is blown one step with its horse, not two', () => {
    const g = board()
    const horse = summonCard(g, 0, 'War Horse', 1, 1)
    const troll = summonCard(g, 0, 'Bosk Troll', 1, 1)
    horse.carryingUnits = [troll.id]; troll.carriedBy = horse.id
    castMagic(g, 0, 'Windblast')
    answer(g, 'east')
    expect(at(g.units[horse.id])).toBe('2,1')
    expect(at(g.units[troll.id]), 'the Troll rode along, one step').toBe('2,1')
    expect(g.units[troll.id].carriedBy, 'and is still carried').toBe(horse.id)
  })

  it('under Magellan Globe a push off the east edge comes back in on the west', () => {
    const g = board()
    groundArtifact(g, 'Magellan Globe', 2, 2)
    const foe = summonCard(g, 1, 'Foot Soldier', 4, 1)
    castMagic(g, 0, 'Windblast')
    answer(g, 'east')
    expect(at(g.units[foe.id])).toBe('0,1')
  })
})

describe('Gargantula and Gloam Toads act only on a minion that was dragged to them', () => {
  it('Gargantula can\'t drag Talamh Dreig ("can\'t be moved by force"), so doesn\'t cocoon it', () => {
    const g = board()
    const dreig = summonCard(g, 1, 'Talamh Dreig', 2, 2)
    const cardId = `ctest${g.nextId++}`
    g.cards[cardId] = { id: cardId, name: 'Gargantula', owner: 0 }
    g.players[0].hand.push(cardId); g.players[0].mana = 20
    act(g, 0, { t: 'castSpell', cardId, casterId: avatarOf(g, 0).id, at: { x: 2, y: 1 }, targets: [dreig.id] })
    expect(at(g.units[dreig.id]), 'not dragged').toBe('2,2')
    expect(g.units[dreig.id].disabled, 'not cocooned').toBeFalsy()
  })

  it('Gargantula still cocoons a minion already sharing her location (FAQ)', () => {
    const g = board()
    const prey = summonCard(g, 1, 'Foot Soldier', 2, 1)
    const cardId = `ctest${g.nextId++}`
    g.cards[cardId] = { id: cardId, name: 'Gargantula', owner: 0 }
    g.players[0].hand.push(cardId); g.players[0].mana = 20
    act(g, 0, { t: 'castSpell', cardId, casterId: avatarOf(g, 0).id, at: { x: 2, y: 1 }, targets: [prey.id] })
    expect(g.units[prey.id].disabled).toBe(true)
  })

  it('Gloam Toads may not strike Talamh Dreig: it never arrives', () => {
    const g = board()
    const toads = ready(summonCard(g, 0, 'Gloam Toads', 2, 2))
    const dreig = summonCard(g, 1, 'Talamh Dreig', 2, 1)
    act(g, 0, { t: 'activate', sourceId: toads.id, ability: 'tongue', targets: [dreig.id] })
    expect(at(g.units[dreig.id])).toBe('2,1')
    expect(g.prompts.length, 'no "strike it?" prompt').toBe(0)
    expect(g.units[dreig.id].damage).toBe(0)
  })
})

describe('Into the Abyss', () => {
  it('the caster chooses which adjacent void the minion is pulled into', () => {
    const g = newGame(); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 1, 1) // its four neighbours are all void
    const foe = summonCard(g, 1, 'Bone Jumble', 1, 1)
    foe.modifiers.push({ kind: 'keyword', keyword: 'voidwalk', duration: 'permanent', turn: g.turn, sourcePlayer: 1 }) // survives, so we see where
    castMagic(g, 0, 'Into the Abyss', { targets: [foe.id] })
    answer(g, 'pull into the void')
    const p = g.prompts[0]
    expect(p?.kind, 'asked which void').toBe('chooseSquare')
    const squares = (p?.data?.squares ?? []) as { x: number; y: number }[]
    expect(squares.length).toBe(4)
    const pick = squares[squares.length - 1]
    answer(g, pick)
    expect(at(g.units[foe.id])).toBe(at(pick))
    expect(g.units[foe.id].region).toBe('void')
  })

  it('submerging is a forced submerge: a minion near an allied Driftwood Marrows stays dry', () => {
    const g = board()
    placeSite(g, 0, 'Pond', 1, 1)
    delete g.sites[Object.values(g.sites).find((s) => s.x === 1 && s.y === 1 && s.name !== 'Pond')!.id]
    const boars = summonCard(g, 1, 'Wild Boars', 1, 1)
    summonCard(g, 1, 'Driftwood Marrows', 1, 2) // "Nearby allies can't be submerged."
    castMagic(g, 0, 'Into the Abyss', { targets: [boars.id] })
    answer(g, 'submerge it')
    expect(g.units[boars.id]?.region, 'not dragged under (nor drowned)').toBe('surface')
  })
})

describe('Red Rock of Ravannis pulls each artifact one step, along with its bearer', () => {
  const endOfTurn = (g: GameState, rock: ArtifactState) => getScript('Red Rock of Ravannis')!.endOfEveryTurn!(makeCtx(g, rock.id, 0, []))

  it('a bearer of two artifacts is pulled one step, not two', () => {
    const g = board()
    const rock = groundArtifact(g, 'Red Rock of Ravannis', 0, 0)
    const bearer = summonCard(g, 1, 'Foot Soldier', 3, 0)
    const core = giveArtifact(g, bearer, 'Ruby Core')
    const spear = giveArtifact(g, bearer, 'Spear of Destiny')
    endOfTurn(g, rock)
    expect(at(g.units[bearer.id])).toBe('2,0')
    expect(g.artifacts[core.id].carriedBy).toBe(bearer.id)
    expect(g.artifacts[spear.id].carriedBy).toBe(bearer.id)
  })

  it('a bearer that can\'t be pulled (Talamh Dreig) loses the artifact: it is pulled out of its hands (FAQ)', () => {
    const g = board()
    const rock = groundArtifact(g, 'Red Rock of Ravannis', 0, 0)
    const dreig = summonCard(g, 1, 'Talamh Dreig', 3, 0)
    const core = giveArtifact(g, dreig, 'Ruby Core')
    endOfTurn(g, rock)
    expect(at(g.units[dreig.id]), 'the Dragon holds its ground').toBe('3,0')
    expect(at(g.artifacts[core.id])).toBe('2,0')
    expect(g.artifacts[core.id].carriedBy).toBeNull()
    expect(g.units[dreig.id].carrying).not.toContain(core.id)
  })

  it('a Monument stays; an Automaton is pulled, unless it can\'t be moved by force', () => {
    const g = board()
    const rock = groundArtifact(g, 'Red Rock of Ravannis', 0, 0)
    const throne = groundArtifact(g, 'The Immortal Throne', 3, 0)
    const golem = summonCard(g, 1, 'Crave Golem', 3, 1)
    const talus = summonCard(g, 1, 'Iron Man Talus', 0, 3)
    endOfTurn(g, rock)
    expect(at(g.artifacts[throne.id]), 'a Monument is never moved').toBe('3,0')
    expect(at(g.units[golem.id]), 'an Automaton is an artifact: pulled').toBe('2,1')
    expect(at(g.units[talus.id]), 'Iron Man Talus can\'t be moved by force').toBe('0,3')
  })
})

describe('Rolling Boulder', () => {
  it('under Magellan Globe it rolls on round the realm until it would repeat a step', () => {
    const g = board(); avatarsAside(g)
    groundArtifact(g, 'Magellan Globe', 2, 2)
    const boulder = groundArtifact(g, 'Rolling Boulder', 2, 0)
    const pusher = ready(summonCard(g, 0, 'Foot Soldier', 2, 0))
    const far = summonCard(g, 1, 'Bone Jumble', 1, 0) // past the east edge, round to the west
    act(g, 0, { t: 'activate', sourceId: pusher.id, ability: 'boulder:push' })
    answer(g, 'e')
    expect(at(g.artifacts[boulder.id]), 'stops just short of where it started').toBe('1,0')
    expect(g.units[far.id] === undefined || g.units[far.id].damage === 4, 'crushed on the wrapped path').toBe(true)
    expect(g.units[pusher.id].damage, 'the pusher is spared').toBe(0)
  })

  it('it stays in its region: a buried Boulder stops before a water site', () => {
    const g = board(); avatarsAside(g)
    placeSite(g, 0, 'Pond', 2, 0)
    delete g.sites[Object.values(g.sites).find((s) => s.x === 2 && s.y === 0 && s.name !== 'Pond')!.id]
    const boulder = groundArtifact(g, 'Rolling Boulder', 1, 0, 'underground')
    const pusher = summonCard(g, 0, 'Foot Soldier', 1, 0, 'underground')
    const beyond = summonCard(g, 1, 'Bone Jumble', 3, 0, 'underground')
    getScript('Rolling Boulder')!.conts!.roll(makeCtx(g, pusher.id, 0, []), { artId: boulder.id }, 'e')
    expect(at(g.artifacts[boulder.id])).toBe('1,0')
    expect(g.units[beyond.id].damage, 'nothing beyond the water is crushed').toBe(0)
  })

  it('an oversized unit on two squares of its path takes the 4 damage once', () => {
    const g = board(); avatarsAside(g)
    const boulder = groundArtifact(g, 'Rolling Boulder', 1, 0)
    const pusher = ready(summonCard(g, 0, 'Foot Soldier', 1, 0))
    const giant = summonCard(g, 1, 'Mountain Giant', 3, 0); giant.size = '2x2' // (3,0) (4,0) (3,1) (4,1)
    act(g, 0, { t: 'activate', sourceId: pusher.id, ability: 'boulder:push' })
    answer(g, 'e')
    expect(at(g.artifacts[boulder.id])).toBe('4,0')
    expect(g.units[giant.id]?.damage).toBe(4)
  })
})

describe('Darkest Dungeon drags both or neither', () => {
  it('when the striking ally is Talamh Dreig ("can\'t be moved by force"), the Avatar isn\'t dragged either', () => {
    const g = newGame(); keepBoth(g)
    const dungeon = placeSite(g, 0, 'Darkest Dungeon', 0, 0)
    fillSites(g)
    g.flow = { ...(g.flow ?? {}), darkestDungeon: { siteId: dungeon.id, player: 0, turn: g.turn } }
    const avatar = avatarOf(g, 1)
    avatar.x = 3; avatar.y = 3; avatar.region = 'surface'
    const dreig = summonCard(g, 0, 'Talamh Dreig', 3, 3)
    emitEvent(g, 'onAllyStrikesAvatar', dreig, avatar)
    expect(at(avatar), 'the Avatar stays').toBe('3,3')
    expect(at(dreig)).toBe('3,3')
  })
})
