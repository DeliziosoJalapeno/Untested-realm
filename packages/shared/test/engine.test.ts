import { describe, it, expect } from 'vitest'
import { newGame, act, actFail, keepBoth, answer, fetchToHand, giveMana } from './helpers'
import {
  avatarOf,
  siteAt,
  legalSiteSquares,
  affinity,
  validateDeck,
  starterDecks,
  cardSupport,
  getCard,
  parseKeywords,
  effAttack,
  effKeywords,
  reachableLocations,
  viewFor,
  summonToken,
  dealDamageToUnit,
} from '../src'

describe('setup & mulligan', () => {
  it('creates a legal starting position', () => {
    const g = newGame()
    expect(g.phase).toBe('mulligan')
    expect(avatarOf(g, 0).x).toBe(2)
    expect(avatarOf(g, 0).y).toBe(0)
    expect(avatarOf(g, 1).y).toBe(3)
    expect(avatarOf(g, 0).life).toBe(20)
    // 3 sites + 3 spells in each hand
    for (const p of g.players) expect(p.hand.length).toBe(6)
  })

  it('starter decks are legal', () => {
    for (const deck of starterDecks) {
      const problems = validateDeck(deck).filter((p) => p.level === 'error')
      expect(problems).toEqual([])
    }
  })

  it('starter decks contain no unsupported cards', () => {
    for (const deck of starterDecks) {
      for (const name of [...Object.keys(deck.spellbook), ...Object.keys(deck.atlas), deck.avatar]) {
        expect(cardSupport(getCard(name)), name).not.toBe('unsupported')
      }
    }
  })

  it('mulligan returns cards and redraws', () => {
    const g = newGame()
    const p = g.players[0]
    const back = p.hand.slice(0, 2)
    act(g, 0, { t: 'mulligan', back })
    expect(p.hand.length).toBe(6)
    expect(p.keptHand).toBe(true)
  })

  it('first player skips the first draw', () => {
    const g = newGame(42, 0)
    keepBoth(g)
    expect(g.phase).toBe('main')
    expect(g.activePlayer).toBe(0)
    expect(g.prompts.length).toBe(0)
  })

  it('second player gets a draw choice on their turn', () => {
    const g = newGame(42, 0)
    keepBoth(g)
    act(g, 0, { t: 'endTurn' })
    expect(g.prompts[0]?.kind).toBe('drawDeck')
    const before = g.players[1].hand.length
    answer(g, 'spellbook')
    expect(g.players[1].hand.length).toBe(before + 1)
    expect(g.phase).toBe('main')
  })
})

describe('sites & mana', () => {
  it('first site must be at the avatar (closest void) and gives mana', () => {
    const g = newGame()
    keepBoth(g)
    const legal = legalSiteSquares(g, 0)
    expect(legal).toContainEqual({ x: 2, y: 0 })
    // all legal squares are at distance 0 from the avatar (its own square)
    expect(legal.length).toBe(1)

    const siteId = g.players[0].hand.find((id) => getCard(g.cards[id].name).type === 'Site')!
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: siteId, x: 2, y: 0 })
    expect(siteAt(g, 2, 0)).toBeTruthy()
    expect(g.players[0].mana).toBeGreaterThanOrEqual(1)
    expect(avatarOf(g, 0).tapped).toBe(true)
  })

  it('later sites must border your existing sites', () => {
    const g = newGame()
    keepBoth(g)
    const siteId = g.players[0].hand.find((id) => getCard(g.cards[id].name).type === 'Site')!
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: siteId, x: 2, y: 0 })
    const legal = legalSiteSquares(g, 0)
    expect(legal).toContainEqual({ x: 1, y: 0 })
    expect(legal).toContainEqual({ x: 3, y: 0 })
    expect(legal).toContainEqual({ x: 2, y: 1 })
    expect(legal).not.toContainEqual({ x: 0, y: 3 })
  })

  it('sites provide mana and affinity at start of turn', () => {
    const g = newGame()
    keepBoth(g)
    // play an earth site for player 0 (Earthfire deck has villages: earth)
    const villageId = fetchToHand(g, 0, 'Rustic Village')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: villageId, x: 2, y: 0 })
    // village genesis: may pay 1 to summon foot soldier — decline
    if (g.prompts.length) answer(g, false)
    expect(affinity(g, 0).earth).toBe(1)
  })
})

describe('casting', () => {
  function withBoard() {
    const g = newGame()
    keepBoth(g)
    const villageId = fetchToHand(g, 0, 'Rustic Village')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: villageId, x: 2, y: 0 })
    if (g.prompts.length) answer(g, false)
    return g
  }

  it('summons a minion with threshold + mana onto own site', () => {
    const g = withBoard()
    giveMana(g, 0, 5)
    const id = fetchToHand(g, 0, 'Cave Trolls')
    act(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    const troll = Object.values(g.units).find((u) => u.name === 'Cave Trolls')!
    expect(troll).toBeTruthy()
    expect(troll.region).toBe('surface')
  })

  it('records lastPlay on a played site and a cast spell (client detail-panel signal)', () => {
    const g = withBoard()
    // playing the site set lastPlay for the acting player
    expect(g.lastPlay?.name).toBe('Rustic Village')
    expect(g.lastPlay?.player).toBe(0)
    const afterSite = g.lastPlay!.n
    giveMana(g, 0, 5)
    const id = fetchToHand(g, 0, 'Cave Trolls')
    act(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    // casting a spell overwrites it and bumps the monotonic counter
    expect(g.lastPlay?.name).toBe('Cave Trolls')
    expect(g.lastPlay?.player).toBe(0)
    expect(g.lastPlay!.n).toBe(afterSite + 1)
  })

  it('rejects casting without threshold', () => {
    const g = newGame()
    keepBoth(g)
    // no sites at all → no earth affinity
    giveMana(g, 0, 10)
    const id = fetchToHand(g, 0, 'Cave Trolls')
    const err = actFail(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    expect(err).toMatch(/threshold|site/i)
  })

  it('genesis triggers: Apprentice Wizard draws a spell', () => {
    const g = newGame()
    keepBoth(g)
    // build an air site for threshold: use Tidecaller (player 1) instead
    act(g, 0, { t: 'endTurn' })
    answer(g, 'atlas')
    const towerId = fetchToHand(g, 1, 'Dark Tower')
    act(g, 1, { t: 'avatarSite', mode: 'play', cardId: towerId, x: 2, y: 3 })
    giveMana(g, 1, 5)
    const wizId = fetchToHand(g, 1, 'Apprentice Wizard')
    const before = g.players[1].hand.length
    act(g, 1, { t: 'castSpell', cardId: wizId, casterId: g.players[1].avatarUnitId, at: { x: 2, y: 3 } })
    // hand: -1 (cast wizard) +1 (genesis draw) = unchanged
    expect(g.players[1].hand.length).toBe(before)
  })

  it('magic resolves and goes to cemetery: Overpower', () => {
    const g = withBoard()
    giveMana(g, 0, 5)
    const id = fetchToHand(g, 0, 'Overpower')
    const avatarId = g.players[0].avatarUnitId
    act(g, 0, { t: 'castSpell', cardId: id, casterId: avatarId, targets: [avatarId] })
    // 1 printed + 2 Overpower + 1 Avatar of Earth (one nearby earth site)
    expect(effAttack(g, avatarOf(g, 0))).toBe(1 + 2 + 1)
    expect(g.players[0].cemetery).toContain(id)
  })
})

describe('movement & regions', () => {
  it('units move one step on the surface between sites', () => {
    const g = newGame()
    keepBoth(g)
    const v1 = fetchToHand(g, 0, 'Rustic Village')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
    if (g.prompts.length) answer(g, false)
    const avatar = avatarOf(g, 0)
    avatar.tapped = false
    // second site next turn
    act(g, 0, { t: 'endTurn' })
    answer(g, 'atlas')
    act(g, 1, { t: 'endTurn' })
    answer(g, 'atlas')
    const v2 = fetchToHand(g, 0, 'Simple Village')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v2, x: 3, y: 0 })
    if (g.prompts.length) answer(g, false)
    // summon a minion and try to move it — summoning sickness prevents tapping
    giveMana(g, 0, 9)
    const id = fetchToHand(g, 0, 'Cave Trolls')
    act(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    const troll = Object.values(g.units).find((u) => u.name === 'Cave Trolls')!
    const err = actFail(g, 0, { t: 'moveAttack', unitId: troll.id, path: [{ x: 3, y: 0, region: 'surface' }] })
    expect(err).toMatch(/sickness/i)
    // next turn it can move
    act(g, 0, { t: 'endTurn' })
    answer(g, 'atlas')
    act(g, 1, { t: 'endTurn' })
    answer(g, 'atlas')
    act(g, 0, { t: 'moveAttack', unitId: troll.id, path: [{ x: 3, y: 0, region: 'surface' }] })
    expect(g.units[troll.id].x).toBe(3)
    expect(g.units[troll.id].tapped).toBe(true)
  })

  it('burrowing units can go underground; others cannot', () => {
    const g = newGame()
    keepBoth(g)
    const v1 = fetchToHand(g, 0, 'Rustic Village')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
    if (g.prompts.length) answer(g, false)
    giveMana(g, 0, 9)
    const id = fetchToHand(g, 0, 'Cave Trolls')
    act(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    const troll = Object.values(g.units).find((u) => u.name === 'Cave Trolls')!
    // burrowing minions may be summoned underground directly too — here test movement
    act(g, 0, { t: 'endTurn' })
    answer(g, 'atlas')
    act(g, 1, { t: 'endTurn' })
    answer(g, 'atlas')
    act(g, 0, { t: 'moveAttack', unitId: troll.id, path: [{ x: 2, y: 0, region: 'underground' }] })
    expect(g.units[troll.id].region).toBe('underground')
    // avatar can never leave the surface
    const reach = reachableLocations(g, avatarOf(g, 0))
    expect(reach.every((s) => s.region === 'surface')).toBe(true)
  })

  it('voidwalk minions can be summoned to the void', () => {
    const g = newGame()
    keepBoth(g)
    act(g, 0, { t: 'endTurn' })
    answer(g, 'atlas')
    const tower = fetchToHand(g, 1, 'Dark Tower')
    act(g, 1, { t: 'avatarSite', mode: 'play', cardId: tower, x: 2, y: 3 })
    giveMana(g, 1, 9)
    const id = fetchToHand(g, 1, 'Spectral Stalker')
    act(g, 1, { t: 'castSpell', cardId: id, casterId: g.players[1].avatarUnitId, at: { x: 0, y: 0, region: 'void' } })
    const stalker = Object.values(g.units).find((u) => u.name === 'Spectral Stalker')!
    expect(stalker.region).toBe('void')
  })
})

describe('combat', () => {
  /** two adjacent boards with a minion each, no sickness */
  function battlefield() {
    const g = newGame()
    keepBoth(g)
    const v1 = fetchToHand(g, 0, 'Rustic Village')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
    if (g.prompts.length) answer(g, false)
    giveMana(g, 0, 9)
    const trollId = fetchToHand(g, 0, 'Cave Trolls')
    act(g, 0, { t: 'castSpell', cardId: trollId, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    const troll = Object.values(g.units).find((u) => u.name === 'Cave Trolls')!
    // player 1: site + minion at (2,3)... place them adjacent for a fight instead:
    // teleport enemy minion onto the troll's square via test manipulation
    const scorpCard = fetchToHand(g, 1, 'Porcupine Pufferfish')
    // create the enemy minion directly (bypasses casting restrictions for the test)
    const enemy = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    enemy.enteredTurn = 0 // no sickness
    troll.enteredTurn = 0
    return { g, troll, enemy }
  }

  it('attacking an enemy unit causes a simultaneous fight', () => {
    const { g, troll, enemy } = battlefield()
    act(g, 0, { t: 'moveAttack', unitId: troll.id, path: [], attack: { unit: enemy.id } })
    // foot soldier (1/1) dies to 3 power; troll takes 1 damage
    expect(g.units[enemy.id]).toBeUndefined()
    expect(g.units[troll.id].damage).toBe(1)
  })

  it('attacking an enemy site causes life loss, not damage', () => {
    const g = newGame()
    keepBoth(g)
    // p0 plays site at (2,0); p1's turn: play site; then p0 summons on own site,
    // moves next to enemy site over two turns... shortcut: relocate p0's minion
    const v1 = fetchToHand(g, 0, 'Rustic Village')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
    if (g.prompts.length) answer(g, false)
    act(g, 0, { t: 'endTurn' })
    answer(g, 'atlas')
    const tower = fetchToHand(g, 1, 'Dark Tower')
    act(g, 1, { t: 'avatarSite', mode: 'play', cardId: tower, x: 2, y: 3 })
    act(g, 1, { t: 'endTurn' })
    answer(g, 'atlas')

    const raider = summonToken(g, 'Foot Soldier', 0, 2, 3)! // standing on the enemy tower
    raider.enteredTurn = 0
    const enemySite = siteAt(g, 2, 3)!
    const lifeBefore = avatarOf(g, 1).life!
    act(g, 0, { t: 'moveAttack', unitId: raider.id, path: [], attack: { site: enemySite.id } })
    // avatar of player 1 is standing there — it may defend; decline
    if (g.prompts.length) answer(g, [])
    expect(avatarOf(g, 1).life).toBe(lifeBefore - 1)
  })

  it('defenders can intercept an attack on a site', () => {
    const g = newGame()
    keepBoth(g)
    const v1 = fetchToHand(g, 0, 'Rustic Village')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
    if (g.prompts.length) answer(g, false)
    act(g, 0, { t: 'endTurn' })
    answer(g, 'atlas')
    const tower = fetchToHand(g, 1, 'Dark Tower')
    act(g, 1, { t: 'avatarSite', mode: 'play', cardId: tower, x: 2, y: 3 })
    act(g, 1, { t: 'endTurn' })
    answer(g, 'atlas')

    const raider = summonToken(g, 'Foot Soldier', 0, 2, 3)!
    raider.enteredTurn = 0
    const guard = summonToken(g, 'Foot Soldier', 1, 2, 3)!
    guard.enteredTurn = 0
    const enemySite = siteAt(g, 2, 3)!
    const lifeBefore = avatarOf(g, 1).life!
    act(g, 0, { t: 'moveAttack', unitId: raider.id, path: [], attack: { site: enemySite.id } })
    // defend prompt: choose the guard
    expect(g.prompts[0]?.kind).toBe('defend')
    answer(g, [guard.id])
    // both 1/1s die in the fight; the site is untouched
    expect(avatarOf(g, 1).life).toBe(lifeBefore)
    expect(g.units[raider.id]).toBeUndefined()
    expect(g.units[guard.id]).toBeUndefined()
  })

  it("death's door then death blow wins the game", () => {
    const g = newGame()
    keepBoth(g)
    const avatar1 = avatarOf(g, 1)
    dealDamageToUnit(g, avatar1, 20, 0)
    expect(avatar1.deathsDoor).toBe(true)
    expect(g.winner).toBeNull() // immune during the turn it hit the door
    dealDamageToUnit(g, avatar1, 1, 0)
    expect(g.winner).toBeNull()
    // next turn: any damage is a death blow
    g.turn += 1
    dealDamageToUnit(g, avatar1, 1, 0)
    expect(g.winner).toBe(0)
    expect(g.phase).toBe('over')
  })

  it('lethal keyword kills on any damage', () => {
    const g = newGame()
    keepBoth(g)
    const v1 = fetchToHand(g, 0, 'Rustic Village')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
    if (g.prompts.length) answer(g, false)
    giveMana(g, 0, 9)
    const scorpId = fetchToHand(g, 0, 'Sirocco Scorpions')
    // scorpions need fire threshold — use a desert
    const g2 = newGame(7)
    keepBoth(g2)
    const desert = fetchToHand(g2, 0, 'Arid Desert')
    act(g2, 0, { t: 'avatarSite', mode: 'play', cardId: desert, x: 2, y: 0 })
    if (g2.prompts.length) answer(g2, []) // desert genesis target: skip
    giveMana(g2, 0, 9)
    const sid = fetchToHand(g2, 0, 'Sirocco Scorpions')
    act(g2, 0, { t: 'castSpell', cardId: sid, casterId: g2.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    const scorp = Object.values(g2.units).find((u) => u.name === 'Sirocco Scorpions')!
    scorp.enteredTurn = 0
    const big = summonToken(g2, 'Foot Soldier', 1, 2, 0)!
    big.enteredTurn = 0
    // make it big so only lethal explains the kill
    big.modifiers.push({ kind: 'power', amount: 5, duration: 'permanent', turn: 0, sourcePlayer: 1 })
    act(g2, 0, { t: 'moveAttack', unitId: scorp.id, path: [], attack: { unit: big.id } })
    expect(g2.units[big.id]).toBeUndefined() // lethal killed a 6/6
  })

  it('lethal keyword does NOT affect avatars — it kills minions only', () => {
    // rulebook glossary: "Lethal — any positive damage it deals to a MINION is
    // lethal". An avatar struck by a Lethal unit just loses life normally.
    const g = newGame(7)
    keepBoth(g)
    const enemyAvatar = g.units[g.players[1].avatarUnitId]
    const scorp = summonToken(g, 'Sirocco Scorpions', 0, enemyAvatar.x, enemyAvatar.y)!
    scorp.enteredTurn = 0
    const lifeBefore = enemyAvatar.life ?? 0
    act(g, 0, { t: 'moveAttack', unitId: scorp.id, path: [], attack: { unit: enemyAvatar.id } })
    // decline any defend/intercept windows so the strike resolves
    let guard = 0
    while (g.prompts.length && guard++ < 10) {
      const k = g.prompts[0].kind
      answer(g, k === 'defend' ? [] : k === 'intercept' ? null : k === 'stayInFight' ? true : null)
    }
    const av = g.units[g.players[1].avatarUnitId]
    expect(av).toBeDefined() // still in the realm
    expect(av.life!).toBeGreaterThan(0) // chipped, not executed
    expect(av.life!).toBeLessThan(lifeBefore) // the strike itself landed
    expect(g.phase).not.toBe('over')
  })

  it('ward absorbs the first damage from an enemy', () => {
    const g = newGame()
    keepBoth(g)
    const guard = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    guard.ward = true
    dealDamageToUnit(g, guard, 5, 0)
    expect(g.units[guard.id]).toBeTruthy()
    expect(guard.ward).toBe(false)
    expect(guard.damage).toBe(0)
  })
})

describe('keyword parsing & support', () => {
  it('parses pure keyword lines', () => {
    const r = parseKeywords('Airborne, Charge')
    expect(r.keywords.airborne).toBe(true)
    expect(r.keywords.charge).toBe(true)
    expect(r.fullyParsed).toBe(true)
  })
  it('flags unparsed text', () => {
    const r = parseKeywords('Genesis → Draw a spell.')
    expect(r.fullyParsed).toBe(false)
  })
  it('movement and ranged values', () => {
    const r = parseKeywords('Airborne, Movement +2')
    expect(r.keywords.movement).toBe(2)
    expect(parseKeywords('Ranged 2').keywords.ranged).toBe(2)
    expect(parseKeywords('Ranged').keywords.ranged).toBe(1)
  })
})

describe('views & hidden information', () => {
  it("hides the opponent's hand and both decks", () => {
    const g = newGame()
    keepBoth(g)
    const view = viewFor(g, 0)
    expect(view.players[1].hand.every((c: string) => c === 'hidden')).toBe(true)
    expect(view.players[1].handCounts.sites + view.players[1].handCounts.spells).toBe(g.players[1].hand.length)
    // no deck contents leaked
    const namesVisible = Object.keys(view.cards).length
    expect(namesVisible).toBeLessThan(Object.keys(g.cards).length)
  })
})

describe('charge & ranged', () => {
  it('charge minions can act the turn they are summoned', () => {
    const g = newGame()
    keepBoth(g)
    const desert = fetchToHand(g, 0, 'Arid Desert')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: desert, x: 2, y: 0 })
    if (g.prompts.length) answer(g, [])
    giveMana(g, 0, 9)
    const id = fetchToHand(g, 0, 'Petrosian Cavalry') // Charge
    act(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    const cav = Object.values(g.units).find((u) => u.name === 'Petrosian Cavalry')!
    expect(effKeywords(g, cav).charge).toBe(true)
    // can tap immediately (attack its own square: nothing there, just move 0 steps → tap works)
    act(g, 0, { t: 'moveAttack', unitId: cav.id, path: [] })
    expect(g.units[cav.id].tapped).toBe(true)
  })
})

describe('all starter decks (incl. community)', () => {
  for (const deck of starterDecks) {
    it(`${deck.name} is legal and every card resolves`, () => {
      const errors = validateDeck(deck).filter((p) => p.level === 'error')
      expect(errors).toEqual([])
      for (const name of [...Object.keys(deck.spellbook), ...Object.keys(deck.atlas), deck.avatar]) {
        expect(() => getCard(name), name).not.toThrow()
      }
    })
  }
})
