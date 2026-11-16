// Frost Mage vs Lavamancer (released 2026-11-13), batch C — movement and terrain: Slide, When the Peaks Fell,
// Terraform, Landslide, Jussi Puffins, Jormungand, Myrmidons, Slag Slug, Stomping Mammoth.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, castMagicFail, answer, act, actFail, waiveThreshold, giveMana, injectToHand, fillSites, settlePrompts } from './helpers'
import {
  isDisabled, siteAt, viewFor, effKeywords, occupiedSquares, effAttack, legalStepsFrom, enterSite, beginAttack, checkStateBased, occupies,
  type GameState, type PlayerId, type UnitState,
} from '../src'
import '../src/cards/scripts/index'

const avatarOf = (g: GameState, p: PlayerId) => g.units[g.players[p].avatarUnitId]

function board(): GameState {
  const g = newGame() as GameState
  keepBoth(g)
  waiveThreshold(g, 0)
  return g
}

/** put player `p`'s Avatar on (x,y) */
function moveAvatar(g: GameState, p: PlayerId, x: number, y: number): UnitState {
  const av = avatarOf(g, p)
  av.x = x; av.y = y; av.region = 'surface'
  return av
}

function disable(g: GameState, u: UnitState): void {
  u.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: g.turn, sourcePlayer: 0 })
}

/** play `name` face-down at (x,y) through the real site entry, replacing a test site already there */
function playTrap(g: GameState, player: PlayerId, name: string, x: number, y: number): string {
  const old = siteAt(g, x, y)
  if (old) delete g.sites[old.id]
  const cid = `ctrap${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: player }
  return enterSite(g, player, cid, x, y)
}

function withGlobe(g: GameState): void {
  const cid = `cglobe${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Magellan Globe', owner: 0 } as any
  const aid = `aglobe${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
}

describe('Slide', () => {
  it('slides an ally as far as possible, through the squares between, and draws a spell', () => {
    const g = board()
    fillSites(g)
    moveAvatar(g, 0, 2, 0)
    const ally = summonCard(g, 0, 'Bone Jumble', 1, 1)
    const book = g.players[0].spellbook.length
    castMagic(g, 0, 'Slide', { targets: [ally.id] })
    answer(g, 'east')
    expect([ally.x, ally.y], 'to the east edge').toEqual([4, 1])
    expect(g.prompts.length, 'no Globe: one farthest location, no choice').toBe(0)
    expect(g.players[0].spellbook.length, 'draw a spell').toBe(book - 1)
  })

  it('stops before the void — never slid into it', () => {
    const g = board()
    fillSites(g)
    moveAvatar(g, 0, 2, 0)
    delete g.sites[siteAt(g, 3, 1)!.id]
    const ally = summonCard(g, 0, 'Bone Jumble', 0, 1)
    castMagic(g, 0, 'Slide', { targets: [ally.id] })
    answer(g, 'east')
    expect([ally.x, ally.y, ally.region]).toEqual([2, 1, 'surface'])
  })

  it('FAQ: sliding never changes regions — an underground ally stops before a water site', () => {
    const g = board()
    fillSites(g)
    moveAvatar(g, 0, 2, 0)
    delete g.sites[siteAt(g, 3, 1)!.id]
    placeSite(g, 0, 'Pond', 3, 1)
    const ally = summonCard(g, 0, 'Cave Trolls', 0, 1, 'underground')
    castMagic(g, 0, 'Slide', { targets: [ally.id] })
    answer(g, 'east')
    expect([ally.x, ally.y, ally.region]).toEqual([2, 1, 'underground'])
  })

  it('Magellan Globe: the slide crosses the joined edge to the farthest location (owner ruling)', () => {
    const g = board()
    fillSites(g)
    withGlobe(g)
    moveAvatar(g, 0, 2, 0)
    const ally = summonCard(g, 0, 'Bone Jumble', 1, 2)
    castMagic(g, 0, 'Slide', { targets: [ally.id] })
    answer(g, 'north')
    // north from row 2: rows 3, 0 (across the edge), 1 — row 0 is 2 steps away, the others 1
    expect([ally.x, ally.y]).toEqual([1, 0])
    expect(g.prompts.length).toBe(0)
  })

  it('Magellan Globe: farthest locations tie → the caster chooses among exactly those', () => {
    const g = board()
    fillSites(g)
    withGlobe(g)
    moveAvatar(g, 0, 2, 0)
    const ally = summonCard(g, 0, 'Bone Jumble', 1, 1)
    const book = g.players[0].spellbook.length
    castMagic(g, 0, 'Slide', { targets: [ally.id] })
    answer(g, 'east')
    // east from column 1: columns 2, 3, 4, 0 — columns 3 and 4 are both 2 steps away (wrapped)
    const p: any = g.prompts[0]
    expect(p.kind).toBe('chooseSquare')
    expect(p.data.squares).toEqual([{ x: 3, y: 1 }, { x: 4, y: 1 }])
    expect(actFail(g, 0, { t: 'prompt', promptId: p.id, choice: { x: 0, y: 1 } }), 'only a tied location').toBeTruthy()
    answer(g, { x: 4, y: 1 })
    expect([ally.x, ally.y]).toEqual([4, 1])
    expect(g.players[0].spellbook.length, 'then draw a spell').toBe(book - 1)
  })

  it('oversized, no Globe: the whole 2x2 slides to the farthest position that fits, no prompt', () => {
    const g = board()
    fillSites(g)
    moveAvatar(g, 0, 2, 0)
    const giant = summonCard(g, 0, 'Mountain Giant', 0, 0); giant.size = '2x2'
    castMagic(g, 0, 'Slide', { targets: [giant.id] })
    answer(g, 'east')
    expect([giant.x, giant.y]).toEqual([3, 0])
    expect(g.prompts.length).toBe(0)
  })

  it('oversized, Magellan Globe: a 2x2 slides across the seam and comes to rest straddling it', () => {
    const g = board()
    fillSites(g)
    withGlobe(g)
    moveAvatar(g, 0, 2, 0)
    const giant = summonCard(g, 0, 'Mountain Giant', 1, 1); giant.size = '2x2'
    castMagic(g, 0, 'Slide', { targets: [giant.id] })
    answer(g, 'north')
    // anchor rows 2, 3 (straddling rows 3 and 0), 0 — then back to its start: row 3 is 2 away, unique
    expect([giant.x, giant.y]).toEqual([1, 3])
    expect(occupiedSquares(giant)).toEqual(expect.arrayContaining([{ x: 1, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 0 }, { x: 2, y: 0 }]))
    expect(g.prompts.length).toBe(0)
  })

  it('oversized, Magellan Globe: tied farthest anchors → the caster chooses among exactly those', () => {
    const g = board()
    fillSites(g)
    withGlobe(g)
    moveAvatar(g, 0, 2, 0)
    const giant = summonCard(g, 0, 'Mountain Giant', 1, 1); giant.size = '2x2'
    castMagic(g, 0, 'Slide', { targets: [giant.id] })
    answer(g, 'east')
    const p: any = g.prompts[0]
    expect(p.kind).toBe('chooseSquare')
    expect(p.data.squares).toEqual([{ x: 3, y: 1 }, { x: 4, y: 1 }])
    answer(g, { x: 4, y: 1 })
    expect([giant.x, giant.y]).toEqual([4, 1])
    expect(occupiedSquares(giant)).toEqual(expect.arrayContaining([{ x: 4, y: 1 }, { x: 0, y: 1 }, { x: 4, y: 2 }, { x: 0, y: 2 }]))
  })

  it('a disabled enemy may be slid; an enemy that is not disabled may not', () => {
    const g = board()
    fillSites(g)
    moveAvatar(g, 0, 2, 0)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2)
    expect(castMagicFail(g, 0, 'Slide', { targets: [foe.id] })).toBeTruthy()
    disable(g, foe)
    castMagic(g, 0, 'Slide', { targets: [foe.id] })
    answer(g, 'north')
    expect([foe.x, foe.y]).toEqual([2, 3])
  })
})

describe('When the Peaks Fell', () => {
  it('snow rolls forward from each chosen allied site, carrying surface units to where it stops; 3 damage and disabled', () => {
    const g = board()
    fillSites(g)
    moveAvatar(g, 0, 4, 0)
    const from = siteAt(g, 1, 0)!
    const a = summonCard(g, 1, 'Escyllion Cyclops', 1, 0)
    const b = summonCard(g, 1, 'Escyllion Cyclops', 1, 2)
    const side = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
    const under = summonCard(g, 1, 'Cave Trolls', 1, 1, 'underground')
    castMagic(g, 0, 'When the Peaks Fell')
    answer(g, [from.id])
    for (const u of [a, b]) {
      expect([u.x, u.y], 'carried to the far edge').toEqual([1, 3])
      expect(u.damage).toBe(3)
      expect(isDisabled(g, u)).toBe(true)
    }
    expect(side.damage, 'not in the path').toBe(0)
    expect([under.x, under.y, under.damage], 'only surface units').toEqual([1, 1, 0])
  })

  it("FAQ: snow that doesn't move doesn't stop — it affects no one", () => {
    const g = board()
    fillSites(g)
    const last = siteAt(g, 1, 3)!
    last.controller = 0
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 3)
    castMagic(g, 0, 'When the Peaks Fell')
    answer(g, [last.id])
    expect(foe.damage).toBe(0)
    expect(isDisabled(g, foe)).toBe(false)
  })

  it('FAQ: another snow rolling onto units at the farthest site still affects them', () => {
    const g = board()
    fillSites(g)
    const last = siteAt(g, 1, 3)!
    last.controller = 0
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 3)
    castMagic(g, 0, 'When the Peaks Fell')
    answer(g, [last.id, siteAt(g, 1, 0)!.id])
    expect(foe.damage).toBe(3)
    expect(isDisabled(g, foe)).toBe(true)
  })

  it("FAQ: a unit that doesn't end up where the snow stops isn't affected", () => {
    const g = board()
    fillSites(g)
    delete g.sites[siteAt(g, 1, 2)!.id]
    placeSite(g, 1, 'Gnome Hollows', 1, 2) // power 3 or more can't enter
    const big = summonCard(g, 1, 'Escyllion Cyclops', 1, 1)
    const small = summonCard(g, 1, 'Bone Jumble', 1, 1)
    castMagic(g, 0, 'When the Peaks Fell')
    answer(g, [siteAt(g, 1, 0)!.id])
    expect([big.x, big.y, big.damage], 'held back by the Hollows').toEqual([1, 1, 0])
    expect(isDisabled(g, big)).toBe(false)
    expect([small.x, small.y], 'carried on').toEqual([1, 3])
    expect(g.units[small.id], 'and buried: 3 damage kills the 1/1').toBeUndefined()
  })

  it('FAQ: hit by several snows, a unit takes the 3 damage only once', () => {
    const g = board()
    fillSites(g)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 2)
    castMagic(g, 0, 'When the Peaks Fell')
    answer(g, [siteAt(g, 1, 0)!.id, siteAt(g, 1, 1)!.id])
    expect([foe.x, foe.y, foe.damage]).toEqual([1, 3, 3])
  })

  it('FAQ: damage and disable are simultaneous — a minion it kills gets no Deathrite', () => {
    const g = board()
    fillSites(g)
    const twosome = summonCard(g, 1, 'Noisome Twosome', 1, 1)
    castMagic(g, 0, 'When the Peaks Fell')
    answer(g, [siteAt(g, 1, 0)!.id])
    settlePrompts(g)
    expect(g.units[twosome.id]).toBeUndefined()
    expect(Object.values(g.units).some((u) => u.name === 'Skeleton'), 'no Deathrite Skeleton').toBe(false)
  })

  it('choosing no site does nothing', () => {
    const g = board()
    fillSites(g)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 0)
    castMagic(g, 0, 'When the Peaks Fell')
    answer(g, [])
    expect([foe.x, foe.y, foe.damage]).toEqual([1, 0, 0])
  })
})

describe('Terraform', () => {
  it("replaces every site in the caster's column with the top of its controller's atlas, back row first", () => {
    const g = board()
    for (let y = 0; y < 4; y++) placeSite(g, y < 2 ? 0 : 1, 'Rustic Village', 2, y)
    moveAvatar(g, 0, 2, 0)
    const old = [0, 1, 2, 3].map((y) => siteAt(g, 2, y)!)
    const top0 = g.players[0].atlas.slice(0, 2)
    const top1 = g.players[1].atlas.slice(0, 2)
    castMagic(g, 0, 'Terraform')
    settlePrompts(g)
    const now = [0, 1, 2, 3].map((y) => siteAt(g, 2, y)!)
    expect(now.map((s) => s.cardId)).toEqual([top0[0], top0[1], top1[0], top1[1]])
    expect(now.map((s) => s.controller)).toEqual([0, 0, 1, 1])
    for (const s of old) expect(g.players[s.owner].banished, 'the replaced site is banished').toContain(s.cardId)
  })

  it('FAQ: a Trap on top of the atlas replaces the site face-down, unrevealed to the opponent', () => {
    const g = board()
    moveAvatar(g, 0, 2, 0)
    const old = placeSite(g, 0, 'Rustic Village', 2, 0)
    const cid = injectToHand(g, 0, 'Landslide')
    g.players[0].hand = g.players[0].hand.filter((id) => id !== cid)
    g.players[0].atlas.unshift(cid)
    castMagic(g, 0, 'Terraform')
    settlePrompts(g)
    const now = siteAt(g, 2, 0)!
    expect(now.cardId).toBe(cid)
    expect(now.name, 'face-down as its basic site').toBe('Valley')
    expect(JSON.stringify(viewFor(g, 1)).includes('Landslide')).toBe(false)
    expect(g.players[0].banished).toContain(old.cardId)
  })

  it("Codex Replace: with no replacement (empty atlas) nothing happens and the original isn't banished", () => {
    const g = board()
    moveAvatar(g, 0, 2, 0)
    const old = placeSite(g, 0, 'Rustic Village', 2, 0)
    g.players[0].atlas = []
    castMagic(g, 0, 'Terraform')
    settlePrompts(g)
    expect(g.sites[old.id]).toBeTruthy()
    expect(g.players[0].banished).not.toContain(old.cardId)
  })

  it("review: a top site that can't be played there isn't named in the log (hidden atlas)", () => {
    const g = board()
    fillSites(g, 0) // no void anywhere: Edge of the World can't be played
    moveAvatar(g, 0, 2, 0)
    const cid = injectToHand(g, 0, 'Edge of the World')
    g.players[0].hand = g.players[0].hand.filter((id) => id !== cid)
    g.players[0].atlas.unshift(cid)
    const old = siteAt(g, 2, 0)!
    castMagic(g, 0, 'Terraform')
    settlePrompts(g)
    expect(siteAt(g, 2, 0)!.id, 'the original stays').toBe(old.id)
    expect(g.players[0].atlas[0]).toBe(cid)
    expect(JSON.stringify(viewFor(g, 1)).includes('Edge of the World')).toBe(false)
  })

  it('leaves Rubble alone (no controller, no atlas)', () => {
    const g = board()
    moveAvatar(g, 0, 2, 0)
    placeSite(g, 0, 'Rustic Village', 2, 0)
    const rubble = placeSite(g, 0, 'Rustic Village', 2, 1)
    rubble.isRubble = true; rubble.controller = null
    castMagic(g, 0, 'Terraform')
    settlePrompts(g)
    expect(g.sites[rubble.id]).toBeTruthy()
  })
})

describe('Landslide', () => {
  it('swaps this site with another adjacent site, contents and all', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Landslide', 2, 1)
    const other = siteAt(g, 3, 1)!
    const rider = summonCard(g, 1, 'Bone Jumble', 3, 1)
    giveMana(g, 0, 10)
    act(g, 0, { t: 'activate', sourceId: id, ability: 'trap:spring' })
    answer(g, { x: 3, y: 1 })
    expect([g.sites[id].x, g.sites[id].y]).toEqual([3, 1])
    expect([other.x, other.y]).toEqual([2, 1])
    expect([rider.x, rider.y], 'rides its site').toEqual([2, 1])
  })
})

describe('Jussi Puffins', () => {
  it('steps across both pairs of opposite edges, and flies diagonally across a corner', () => {
    const g = board()
    fillSites(g)
    const p = summonCard(g, 0, 'Jussi Puffins', 0, 0)
    const steps = legalStepsFrom(g, p, { x: 0, y: 0, region: 'surface' })
    const has = (x: number, y: number) => steps.some((s) => s.x === x && s.y === y && s.region === 'surface')
    expect(has(4, 0), 'left–right').toBe(true)
    expect(has(0, 3), 'top–bottom').toBe(true)
    expect(has(4, 3), 'diagonal across the corner').toBe(true)
    const mid = legalStepsFrom(g, p, { x: 2, y: 1, region: 'surface' })
    expect(mid.some((s) => s.x === 2 && s.y === 3), 'no wrap from the middle').toBe(false)
  })
})

describe('Jormungand', () => {
  it('must be summoned to an outer site, then occupies every outer location, inner squares excluded', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 2, 1)
    placeSite(g, 0, 'Rustic Village', 0, 0)
    giveMana(g, 0, 20)
    const inner = injectToHand(g, 0, 'Jormungand')
    expect(actFail(g, 0, { t: 'castSpell', cardId: inner, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 1 } })).toMatch(/outer/)
    act(g, 0, { t: 'castSpell', cardId: inner, casterId: g.players[0].avatarUnitId, at: { x: 0, y: 0 } })
    settlePrompts(g)
    const j = Object.values(g.units).find((u) => u.name === 'Jormungand')!
    expect(j).toBeTruthy()
    expect(j.extraSquares!.length, '14 outer squares, minus its anchor').toBe(13)
    expect(occupies(j, 4, 3), 'the far corner (a void)').toBe(true)
    expect(occupies(j, 2, 1), 'an inner square').toBe(false)
    expect(g.units[j.id], 'safe in the outer voids').toBeTruthy()
  })

  it("can't be modified: not disabled", () => {
    const g = board()
    fillSites(g)
    const j = summonCard(g, 0, 'Jormungand', 0, 0)
    checkStateBased(g)
    disable(g, j)
    expect(isDisabled(g, j)).toBe(false)
    expect(effKeywords(g, j).immobile, "its own Immobile survives the can't-be-modified strip").toBe(true)
  })
})

describe('Myrmidons', () => {
  it('+1 power for each site in their span of land, whoever controls it', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 0, 0)
    placeSite(g, 1, 'Rustic Village', 1, 0)
    placeSite(g, 0, 'Rustic Village', 1, 1)
    placeSite(g, 0, 'Rustic Village', 3, 0) // not connected
    const m = summonCard(g, 0, 'Myrmidons', 0, 0)
    expect(effAttack(g, m)).toBe(3)
    m.region = 'underground'
    expect(effAttack(g, m), 'underground, same span').toBe(3)
    m.silenced = true
    expect(effAttack(g, m), 'an ability — gone when silenced').toBe(0)
  })
})

describe('Slag Slug', () => {
  it('deals 2 damage to the units at a site it leaves', () => {
    const g = board()
    fillSites(g)
    const slug = summonCard(g, 0, 'Slag Slug', 1, 1)
    const left = summonCard(g, 1, 'Escyllion Cyclops', 1, 1)
    const below = summonCard(g, 1, 'Cave Trolls', 1, 1, 'underground')
    const there = summonCard(g, 1, 'Escyllion Cyclops', 1, 2)
    act(g, 0, { t: 'moveAttack', unitId: slug.id, path: [{ x: 1, y: 2, region: 'surface' }] })
    settlePrompts(g)
    expect(g.units[left.id].damage).toBe(2)
    expect(g.units[below.id].damage, 'the subsurface is "there" too').toBe(2)
    expect(g.units[there.id].damage).toBe(0)
    expect(g.units[slug.id].damage, 'FAQ: the Slug never damages itself').toBe(0)
  })
})

describe('Stomping Mammoth', () => {
  it("while attacking, its excess damage is dealt to its site (the site's controller loses life)", () => {
    const g = board()
    fillSites(g, 1)
    const m = summonCard(g, 0, 'Stomping Mammoth', 2, 2)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2)
    const life = avatarOf(g, 1).life!
    expect(beginAttack(g, m, { unit: foe.id })).toBeNull()
    settlePrompts(g)
    expect(g.units[foe.id]).toBeUndefined()
    expect(avatarOf(g, 1).life, '4 power − 1 life = 3 excess').toBe(life - 3)
  })

  it('an Avatar struck past 0 life: the rest goes to the site', () => {
    const g = board()
    fillSites(g, 0)
    const m = summonCard(g, 0, 'Stomping Mammoth', 2, 2)
    const av = moveAvatar(g, 1, 2, 2)
    av.life = 3
    const mine = avatarOf(g, 0).life!
    expect(beginAttack(g, m, { unit: av.id })).toBeNull()
    settlePrompts(g)
    expect(av.life).toBe(0)
    expect(avatarOf(g, 0).life, 'my own site takes the 1 excess').toBe(mine - 1)
  })

  it("FAQ: attacking from its controller's own site, the excess costs its controller life", () => {
    const g = board()
    fillSites(g, 0)
    const m = summonCard(g, 0, 'Stomping Mammoth', 2, 2)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2)
    const mine = avatarOf(g, 0).life!
    expect(beginAttack(g, m, { unit: foe.id })).toBeNull()
    settlePrompts(g)
    expect(avatarOf(g, 0).life).toBe(mine - 3)
  })

  it('FAQ: with two defenders each must be dealt lethal damage first; only the rest goes to the site', () => {
    const g = board()
    fillSites(g, 1)
    const m = summonCard(g, 0, 'Stomping Mammoth', 2, 2)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2)
    const guard = summonCard(g, 1, 'Bone Jumble', 2, 2)
    const life = avatarOf(g, 1).life!
    expect(beginAttack(g, m, { unit: foe.id })).toBeNull()
    expect(g.prompts[0].kind).toBe('defend')
    answer(g, [guard.id])
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      // the attacker tries to pile all 4 on one defender: the engine still kills both, 2 is excess
      if (p.kind === 'allocateDamage' && p.data.strikerId === m.id) answer(g, { strikerId: m.id, allocation: { [foe.id]: 4 } })
      else answer(g, p.kind === 'allocateDamage' ? { strikerId: p.data.strikerId, allocation: { [m.id]: p.data.power } } : true)
    }
    expect(g.units[foe.id]).toBeUndefined()
    expect(g.units[guard.id]).toBeUndefined()
    expect(avatarOf(g, 1).life).toBe(life - 2)
  })

  it("review: under-allocating can't dodge the excess — unassigned power goes to the site too", () => {
    const g = board()
    fillSites(g, 0)
    const m = summonCard(g, 0, 'Stomping Mammoth', 2, 2)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2)
    const guard = summonCard(g, 1, 'Bone Jumble', 2, 2)
    const mine = avatarOf(g, 0).life!
    expect(beginAttack(g, m, { unit: foe.id })).toBeNull()
    answer(g, [guard.id])
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      if (p.kind === 'allocateDamage' && p.data.strikerId === m.id) answer(g, { strikerId: m.id, allocation: { [foe.id]: 1, [guard.id]: 1 } })
      else answer(g, p.kind === 'allocateDamage' ? { strikerId: p.data.strikerId, allocation: { [m.id]: p.data.power } } : true)
    }
    expect(g.units[foe.id]).toBeUndefined()
    expect(g.units[guard.id]).toBeUndefined()
    expect(avatarOf(g, 0).life, 'the 2 left over still hit my own site').toBe(mine - 2)
    expect(g.flow?.battleScratch, 'no per-battle notes linger').toBeUndefined()
  })

  it('review: with Lethal, 1 damage is lethal — the other 3 are excess', () => {
    const g = board()
    fillSites(g, 1)
    const m = summonCard(g, 0, 'Stomping Mammoth', 2, 2)
    m.modifiers.push({ kind: 'keyword', keyword: 'lethal', duration: 'permanent', turn: g.turn, sourcePlayer: 0 } as any)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
    const life = avatarOf(g, 1).life!
    expect(beginAttack(g, m, { unit: foe.id })).toBeNull()
    settlePrompts(g)
    expect(g.units[foe.id]).toBeUndefined()
    expect(avatarOf(g, 1).life).toBe(life - 3)
  })

  it('review: striking an Avatar while defending leaves no note behind', () => {
    const g = board()
    fillSites(g, 1)
    const m = summonCard(g, 0, 'Stomping Mammoth', 2, 2)
    const av = moveAvatar(g, 1, 2, 2)
    g.activePlayer = 1
    expect(beginAttack(g, av, { unit: m.id })).toBeNull()
    settlePrompts(g)
    expect(g.flow?.battleScratch).toBeUndefined()
    expect(g.flow?.mammothAvatarLife).toBeUndefined()
  })

  it('not while defending', () => {
    const g = board()
    fillSites(g, 1)
    const m = summonCard(g, 0, 'Stomping Mammoth', 2, 2)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2)
    const life = avatarOf(g, 1).life!
    g.activePlayer = 1
    expect(beginAttack(g, foe, { unit: m.id })).toBeNull()
    settlePrompts(g)
    expect(g.units[foe.id]).toBeUndefined()
    expect(avatarOf(g, 1).life).toBe(life)
  })
})
