// Deterministic decision tests for the new bot (packages/client/src/bot.ts).
// These build small explicit boards with the shared auditboard helpers and assert
// the bot picks the intended action. The final case drives EVERY prompt kind
// through the real engine and asserts each answer is ACCEPTED (res.ok) — the
// concede-cascade guard.
//
// Runs under the client vitest (jsdom) config via `npm run audit:dom`; bot.ts has
// no DOM dependency so the environment is irrelevant here.

import { describe, it, expect } from 'vitest'
import {
  board,
  boardWithAvatar,
  place,
  usummon,
  inject,
  avatarOf,
  applyAction,
  createGame,
  starterDecks,
  getCard,
  type GameState,
  type PlayerId,
  type Action,
  type UnitState,
} from '@sorcery/shared'
import { botAction, botActionKey } from '../src/bot'

/** find a controlled unit by name. */
function unitByName(g: GameState, p: PlayerId, name: string): UnitState | undefined {
  return Object.values(g.units).find((u) => u.controller === p && u.name === name)
}

/** clear player 0's hand so casting doesn't preempt the behavior under test. */
function emptyHand(g: GameState, p: PlayerId): void {
  g.players[p].hand = []
}

/** make it p0's clean main phase: no prompts, main phase, avatar untapped. */
function readyMain(g: GameState): void {
  g.prompts = []
  g.phase = 'main'
  g.activePlayer = 0
}

describe('new bot — decision tests', () => {
  it('(a) attacks an undefended enemy site when nothing better exists', () => {
    const g = board()
    readyMain(g)
    emptyHand(g, 0)
    g.players[0].atlas = [] // no site-draw temptation
    // our attacker sits ON an undefended enemy site; no enemy units nearby.
    // remove enemy Foot Soldier so there's no unit to fight.
    for (const u of Object.values(g.units)) if (u.controller === 1 && !u.isAvatar) delete g.units[u.id]
    // an enemy site at (0,0) with no defenders; our minion standing on it.
    place(g, 1, 'Rustic Village', 0, 0)
    const atkId = usummon(g, 0, 'Foot Soldier', 0, 0)
    g.units[atkId].enteredTurn = -5 // no summoning sickness
    // move the enemy avatar far so no melee/lethal line competes
    const ea = avatarOf(g, 1)
    ea.x = 4; ea.y = 3
    const action = botAction(g, 0)
    expect(action.t).toBe('moveAttack')
    if (action.t === 'moveAttack') {
      expect(action.attack && 'site' in action.attack).toBe(true)
      const siteId = (action.attack as any).site
      expect(g.sites[siteId].controller).toBe(1)
    }
    // ANTI-LOOP WARD: banning that action excludes it from the search — the bot picks something else.
    const banned = new Set([botActionKey(action)])
    const next = botAction(g, 0, banned)
    expect(botActionKey(next), 'the banned action is not re-picked').not.toBe(botActionKey(action))
  })

  it('(b) finds lethal via a damage spell on a death\'s-door avatar', () => {
    const g = board()
    readyMain(g)
    emptyHand(g, 0)
    // enemy avatar at death's door in line with our caster; give us Fireball.
    const ea = avatarOf(g, 1)
    ea.deathsDoor = true
    ea.doorTurn = -5
    const av = avatarOf(g, 0)
    // put our avatar and enemy avatar on the same file with a clear line
    av.x = 2; av.y = 0
    ea.x = 2; ea.y = 3
    // clear any units between them
    for (const u of Object.values(g.units)) if (!u.isAvatar) delete g.units[u.id]
    const fb = inject(g, 0, 'Fireball') // projectile down a cardinal line
    g.players[0].mana = 50
    const action = botAction(g, 0)
    expect(action.t).toBe('castSpell')
    if (action.t === 'castSpell') {
      expect(action.cardId).toBe(fb)
      // enemy avatar is at higher y (south of us on screen, +y = 'n' in engine
      // dir convention); the projectile fires along that file toward it.
      expect(action.extra?.direction).toBe('n')
    }
  })

  it('(c) activates a beneficial damage ability at an enemy cluster', () => {
    const g = board()
    readyMain(g)
    emptyHand(g, 0)
    g.players[0].atlas = []
    // a Draconian Bonekite (Tap → 3 damage at a nearby location) in play; an enemy
    // minion parked on an adjacent square so the ability has a good target.
    const bk = usummon(g, 0, 'Draconian Bonekite', 1, 1)
    g.units[bk].enteredTurn = -5
    // an enemy minion nearby (within 1) to hit
    for (const u of Object.values(g.units)) if (u.controller === 1 && !u.isAvatar) delete g.units[u.id]
    usummon(g, 1, 'Foot Soldier', 1, 2)
    // move enemy avatar away so lethal/melee doesn't preempt the ability
    const ea = avatarOf(g, 1); ea.x = 4; ea.y = 3
    const action = botAction(g, 0)
    expect(action.t).toBe('activate')
    if (action.t === 'activate') {
      expect(action.sourceId).toBe(bk)
      expect(action.ability).toBe('reap')
      expect(action.targets && action.targets.length).toBeGreaterThan(0)
    }
  })

  it('(d) submerges a Submerge minion only as a survival tie-breaker (surface is lethal, no defense value)', () => {
    // Fresh minimal game: p0 owns exactly ONE site (a water site), so the only
    // summon square is that site. A 10-power enemy sits adjacent, so the ONLY
    // surface spot would one-shot the 1/1 Mermaids for no gain, and a 1/1 can't
    // actually defend the site against a 10-power attacker either. With no
    // subsurface attack path and no defensive value, the survival tie-breaker
    // sends it underwater (where its genesis still fires) — subsurface is NOT the
    // default, only the fallback when the surface spot is a pure death.
    const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 999, 0)
    applyAction(g, 0, { t: 'keepHand' })
    applyAction(g, 1, { t: 'keepHand' })
    readyMain(g)
    g.flow = g.flow ?? {}
    g.flow.noThreshold = { ...(g.flow.noThreshold ?? {}), 0: g.turn }
    // remove any starting non-avatar units
    for (const u of Object.values(g.units)) if (!u.isAvatar) delete g.units[u.id]
    // p0's single site is a water site
    place(g, 0, 'Babbling Brook', 1, 1)
    // a heavy enemy attacker adjacent to (1,1) → the surface there is dangerous
    const threat = usummon(g, 1, 'Foot Soldier', 1, 2)
    g.units[threat].modifiers = [{ kind: 'power', amount: 9, duration: 'permanent' } as any]
    g.units[threat].enteredTurn = -5
    // move the enemy avatar out of the way
    const ea = avatarOf(g, 1); ea.x = 4; ea.y = 3
    const cardId = inject(g, 0, 'Deep-Sea Mermaids')
    g.players[0].mana = 50
    g.players[0].hand = [cardId]
    g.players[0].atlas = []
    const action = botAction(g, 0)
    expect(action.t).toBe('castSpell')
    if (action.t === 'castSpell') {
      expect(action.cardId).toBe(cardId)
      expect((action.at as any)?.region).toBe('underwater')
    }
  })

  it('(d2) summons a plain Submerge minion on the SURFACE by default (aggression, not passivity)', () => {
    // Same board as (d) but NO threat: with a safe surface spot the Submerge minion
    // presses on the surface instead of hiding underwater. Submerge is NOT a reason
    // to go under — the surface is the aggressive default.
    const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 999, 0)
    applyAction(g, 0, { t: 'keepHand' })
    applyAction(g, 1, { t: 'keepHand' })
    readyMain(g)
    g.flow = g.flow ?? {}
    g.flow.noThreshold = { ...(g.flow.noThreshold ?? {}), 0: g.turn }
    for (const u of Object.values(g.units)) if (!u.isAvatar) delete g.units[u.id]
    place(g, 0, 'Babbling Brook', 1, 1)
    // enemy avatar far away; NO enemy minions near our site → surface is safe.
    const ea = avatarOf(g, 1); ea.x = 4; ea.y = 3
    const cardId = inject(g, 0, 'Deep-Sea Mermaids')
    g.players[0].mana = 50
    g.players[0].hand = [cardId]
    g.players[0].atlas = []
    const action = botAction(g, 0)
    expect(action.t).toBe('castSpell')
    if (action.t === 'castSpell') {
      expect(action.cardId).toBe(cardId)
      expect((action.at as any)?.region).toBe('surface')
    }
  })

  it('(d3) casts a Voidwalk minion in the void toward the enemy avatar', () => {
    // A Voidwalk minion (Croll Morlocks: 3/3 Burrowing+Voidwalk) with a site to
    // establish threshold. No threatened undefended site → it should be placed in
    // the void on the ENEMY's half, minimizing distance to the enemy avatar.
    const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 999, 0)
    applyAction(g, 0, { t: 'keepHand' })
    applyAction(g, 1, { t: 'keepHand' })
    readyMain(g)
    g.flow = g.flow ?? {}
    g.flow.noThreshold = { ...(g.flow.noThreshold ?? {}), 0: g.turn }
    for (const u of Object.values(g.units)) if (!u.isAvatar) delete g.units[u.id]
    // our avatar on its home row (y=0); enemy avatar on y=3 (its half = rows 2,3).
    const av = avatarOf(g, 0); av.x = 2; av.y = 0
    const ea = avatarOf(g, 1); ea.x = 2; ea.y = 3
    // a site so we're not blocked, placed on OUR half so the void choice is distinct.
    place(g, 0, 'Rustic Village', 2, 0)
    const cardId = inject(g, 0, 'Croll Morlocks')
    g.players[0].mana = 50
    g.players[0].hand = [cardId]
    g.players[0].atlas = []
    const action = botAction(g, 0)
    expect(action.t).toBe('castSpell')
    if (action.t === 'castSpell') {
      expect(action.cardId).toBe(cardId)
      expect((action.at as any)?.region).toBe('void')
      // it should be on the enemy's half (rows 2 or 3), near the enemy avatar file.
      expect((action.at as any)?.y).toBeGreaterThanOrEqual(2)
    }
  })

  it('(e) hands a weapon artifact to a minion, not the avatar', () => {
    const g = board()
    readyMain(g)
    // exactly one ally minion so the bearer is unambiguous
    for (const u of Object.values(g.units)) if (u.controller === 0 && !u.isAvatar) delete g.units[u.id]
    const bearer = usummon(g, 0, 'Foot Soldier', 1, 1)
    g.units[bearer].enteredTurn = -5
    const cardId = inject(g, 0, 'Excalibur') // Weapon subtype
    g.players[0].mana = 50
    g.players[0].hand = [cardId]
    g.players[0].atlas = []
    const action = botAction(g, 0)
    expect(action.t).toBe('castSpell')
    if (action.t === 'castSpell') {
      expect(action.cardId).toBe(cardId)
      expect(action.extra?.giveTo).toBe(bearer)
      expect(action.extra?.giveTo).not.toBe(avatarOf(g, 0).id)
    }
  })

  it('(f) casts an expansion spell via a qualifying minion when the avatar can\'t', () => {
    const g = board()
    readyMain(g)
    // Smite: "May be cast by any ally", targets an ADJACENT enemy. Put an ally
    // minion adjacent to an enemy minion, far from our avatar, so the avatar has
    // no adjacent enemy and the minion is the only legal caster path.
    for (const u of Object.values(g.units)) if (!u.isAvatar) delete g.units[u.id]
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    const ea = avatarOf(g, 1); ea.x = 4; ea.y = 3
    const caster = usummon(g, 0, 'Foot Soldier', 2, 1)
    g.units[caster].enteredTurn = -5
    const enemy = usummon(g, 1, 'Foot Soldier', 2, 2) // adjacent to (2,1)
    const cardId = inject(g, 0, 'Smite')
    g.players[0].mana = 50
    g.players[0].hand = [cardId]
    g.players[0].atlas = []
    const action = botAction(g, 0)
    expect(action.t).toBe('castSpell')
    if (action.t === 'castSpell') {
      expect(action.cardId).toBe(cardId)
      expect(action.casterId).toBe(caster) // the minion, not the avatar
      expect(action.targets).toContain(enemy)
    }
  })

  it('(z) does not loop forever on a Corpse Catapult held by a lone minion (no second ally to tap)', () => {
    const g = board()
    readyMain(g)
    emptyHand(g, 0)
    g.players[0].atlas = []
    // a single lone bearer; our avatar tapped and off to the side so it can't count
    // as the "another ally here" the fling needs — so the fling is a legal no-op.
    for (const u of Object.values(g.units)) if (u.controller === 0 && !u.isAvatar) delete g.units[u.id]
    const av = avatarOf(g, 0); av.x = 0; av.y = 0; av.tapped = true
    const bearer = usummon(g, 0, 'Foot Soldier', 3, 3)
    g.units[bearer].enteredTurn = -5
    // give it a Corpse Catapult (carried)
    const artCard = 'cc_card'; g.cards[artCard] = { id: artCard, name: 'Corpse Catapult', owner: 0 } as any
    const artId = 'cc_art'; const b = g.units[bearer]
    g.artifacts[artId] = { id: artId, cardId: artCard, name: 'Corpse Catapult', conjuredBy: 0, x: b.x, y: b.y, region: b.region, carriedBy: bearer, tapped: false } as any
    b.carrying.push(artId)
    // a corpse to (try to) fling, and an enemy in range so the fling's target picker
    // has a square to aim at (i.e. the bot really does consider the fling).
    const dead = 'cc_dead'; g.cards[dead] = { id: dead, name: 'Ghoul', owner: 0 } as any
    g.players[0].cemetery.push(dead)
    const ea = avatarOf(g, 1); ea.x = 4; ea.y = 3

    // drive the entire bot turn — it must TERMINATE and never re-pick the no-op fling.
    let steps = 0, flingCount = 0, ended = false
    while (steps++ < 80) {
      const a = botAction(g, 0)
      if (a.t === 'activate' && (a as any).ability === 'fling') flingCount++
      if (a.t === 'endTurn') { ended = true; break }
      applyAction(g, 0, a)
    }
    expect(ended).toBe(true) // reached end of turn — no infinite loop
    expect(flingCount).toBe(0) // the accepted-but-no-op fling is never chosen
  })
})

// ---------------------------------------------------------------------------
// (g) prompt coverage — drive REAL prompts and assert every answer is accepted.
// ---------------------------------------------------------------------------

describe('new bot — prompt coverage (engine-accepted answers)', () => {
  // Play two full bot-vs-bot games and, whenever a prompt appears, answer it via
  // the bot and require res.ok. Across two games the starter decks surface most
  // prompt kinds (drawDeck, defend, allocateDamage, intercept, stayInFight,
  // yesNo, chooseOption, chooseTargets, chooseSquare, chooseCards, orderCards).
  it('answers every prompt encountered in full games without an illegal action', () => {
    const kindsSeen = new Set<string>()
    for (const seed of [12345, 67890, 24680]) {
      const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], seed, 0)
      let steps = 0
      while (g.phase !== 'over' && steps < 1500) {
        steps++
        // both seats are driven by the new bot
        let seat: PlayerId | null = null
        const prompt = g.prompts[0]
        if (prompt) seat = prompt.player as PlayerId
        else if (g.phase === 'mulligan') seat = !g.players[0].keptHand ? 0 : !g.players[1].keptHand ? 1 : null
        else seat = g.activePlayer
        if (seat === null) break
        if (prompt) kindsSeen.add(prompt.kind)
        const action: Action = botAction(g, seat)
        const res = applyAction(g, seat, action)
        // EVERY bot action on a prompt (or a legal main-phase action) must be accepted.
        if (prompt) {
          expect(res.ok, `prompt ${prompt.kind} rejected: ${res.error} (action ${JSON.stringify(action)})`).toBe(true)
        } else if (!res.ok) {
          // a rejected main-phase action is the concede-cascade bug this suite guards.
          expect(res.ok, `main action rejected: ${res.error} (${JSON.stringify(action)})`).toBe(true)
        }
      }
    }
    // sanity: we exercised a meaningful spread of prompt kinds
    expect(kindsSeen.size).toBeGreaterThanOrEqual(3)
  })
})
