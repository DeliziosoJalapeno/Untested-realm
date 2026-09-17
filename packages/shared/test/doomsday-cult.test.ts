// Doomsday Cult: "Players play with the top card of their spellbook revealed. Players may cast Evil from
// the top of their spellbook here." The engine long-since granted the avatar a "take up the top" ability,
// but nothing surfaced the top card. viewFor now exposes BOTH players' spellbook tops (public info) while a
// live Cult is in play, so the GUI can show them — and the take-up ability auto-offers the cast.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, waiveThreshold } from './helpers'
import { viewFor, canActivate, applyAction, checkStateBased, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

function topWith(g: GameState, player: PlayerId, name: string): string {
  const cid = `top${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: player }
  g.players[player].spellbook.unshift(cid)
  return cid
}

describe('Doomsday Cult reveals the top of each spellbook', () => {
  it('exposes both players’ tops to everyone only while a live Cult is in play', () => {
    const g = newGame() as GameState; keepBoth(g)
    const t0 = topWith(g, 0, 'Bone Jumble')   // Evil (Undead)
    const t1 = topWith(g, 1, 'Aethermoeba')   // Evil (Monster)

    // no Cult yet → the tops stay hidden (only counts are public)
    expect(viewFor(g, 0).players[0].spellbookTop).toBeUndefined()

    const cult = summonCard(g, 0, 'Doomsday Cult', 2, 2)

    // my view sees both tops, with the card data present
    const v0 = viewFor(g, 0)
    expect(v0.players[0].spellbookTop).toBe(t0)
    expect(v0.players[1].spellbookTop).toBe(t1)
    expect(v0.cards[t0]?.name).toBe('Bone Jumble')
    expect(v0.cards[t1]?.name).toBe('Aethermoeba')
    // the opponent's view sees them too (the reveal is public)
    const v1 = viewFor(g, 1)
    expect(v1.players[0].spellbookTop).toBe(t0)
    expect(v1.cards[t0]?.name).toBe('Bone Jumble')

    // a silenced Cult reveals nothing
    cult.silenced = true
    expect(viewFor(g, 0).players[0].spellbookTop).toBeUndefined()
  })

  it('casts the Evil top for real at the Cult — no hand pick-up — and it dies to the cemetery', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2) // the Cult sits on a site so the minion can land
    const t0 = topWith(g, 0, 'Bone Jumble')  // a vanilla 1/1 Undead — no Genesis targets
    summonCard(g, 0, 'Doomsday Cult', 2, 2)
    g.players[0].mana = 20
    waiveThreshold(g, 0)
    const av = g.players[0].avatarUnitId
    const before = g.players[0].mana

    expect(canActivate(g, 0, av, 'cult:sermon'), 'the Cult ability is available for an Evil top').toBeNull()
    const res = applyAction(g, 0, { t: 'activate', sourceId: av, ability: 'cult:sermon' })
    expect(res.ok, `activation rejected: ${res.error}`).toBe(true)

    // the top card left the spellbook and was NEVER put in hand (no pick-up)
    expect(g.players[0].spellbook.includes(t0), 'the top left the spellbook').toBe(false)
    expect(g.players[0].hand.includes(t0), 'it was NOT placed in hand').toBe(false)
    // a Bone Jumble was cast onto the board at the Cult's site, cost paid
    const bj = Object.values(g.units).find((u) => u.name === 'Bone Jumble' && u.controller === 0)!
    expect(bj, 'the minion was cast onto the board').toBeTruthy()
    expect({ x: bj.x, y: bj.y }, 'it landed on the Cult’s site').toEqual({ x: 2, y: 2 })
    expect(g.players[0].mana, 'its cost was paid').toBeLessThan(before)

    // it is a REAL card, so slaying it routes to the cemetery (not a vanishing token)
    const cid = bj.cardId
    expect(g.cards[cid]?.isToken ?? false, 'cast as a real card, not a token').toBe(false)
    bj.damage = 99
    checkStateBased(g)
    expect(g.units[bj.id], 'the minion died').toBeUndefined()
    expect(g.players[0].cemetery.includes(cid), 'the slain minion is in the cemetery').toBe(true)
  })

  it('offers no take-up when the top is not an Evil minion', () => {
    const g = newGame() as GameState; keepBoth(g)
    topWith(g, 0, 'Rustic Village') // a Site — not an Evil minion
    summonCard(g, 0, 'Doomsday Cult', 2, 2)
    const av = g.players[0].avatarUnitId
    expect(canActivate(g, 0, av, 'cult:sermon')).not.toBeNull()
  })
})
