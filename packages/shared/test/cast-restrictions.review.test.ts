// Reviewer-reported cast-legality holes:
//  - Jack the Ripper "may be cast to any Mortal": not onto an enemy site with no Mortal there.
//  - The Ninth Legion "must be cast to a corner" only RESTRICTS: not onto an enemy corner site.
//  - Valor / Dodge Roll "may be cast when…": never as an ordinary main-phase cast.
//  - Joust! / Duel: the enemy must be adjacent to the chosen ally (rejected at targeting, not fizzled).
//  - The bot considers casting a Voidwalk minion into the void.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, placeSite, summonCard, injectToHand, castMagicFail, waiveThreshold } from './helpers'
import { validateSummonAt, canCast, siteAt, type PlayerId } from '../src'
import { expandActions } from '../src/bot/moves'
import '../src/cards/scripts/index'

function setup() {
  const g = newGame(); keepBoth(g)
  const p = g.activePlayer, q = (1 - p) as PlayerId
  return { g, p, q }
}

describe('cast restrictions (review findings)', () => {
  it('Jack the Ripper: an enemy site needs a Mortal on it; own sites are fine', () => {
    const { g, p, q } = setup()
    placeSite(g, q, 'Rustic Village', 2, 1)
    placeSite(g, p, 'Rustic Village', 2, 2)
    expect(validateSummonAt(g, p, 'Jack the Ripper', { x: 2, y: 1, region: 'surface' }), 'empty enemy site').not.toBeNull()
    expect(validateSummonAt(g, p, 'Jack the Ripper', { x: 2, y: 2, region: 'surface' }), 'own site').toBeNull()
    summonCard(g, q, 'Common Cottagers', 2, 1) // a Mortal
    expect(validateSummonAt(g, p, 'Jack the Ripper', { x: 2, y: 1, region: 'surface' }), 'enemy site with a Mortal').toBeNull()
  })

  it('Jack the Ripper: "may" — still allowed wherever any minion could be cast (an open enemy site)', () => {
    const { g, p, q } = setup()
    placeSite(g, q, 'Donnybrook Inn', 2, 1) // anyone's minions may be summoned here
    expect(validateSummonAt(g, p, 'Jack the Ripper', { x: 2, y: 1, region: 'surface' })).toBeNull()
  })

  it('The Ninth Legion: own corner site or a void corner, never an enemy corner site', () => {
    const { g, p, q } = setup()
    for (const s of Object.values(g.sites)) if ((s.x === 0 || s.x === 4) && (s.y === 0 || s.y === 3)) delete g.sites[s.id]
    placeSite(g, q, 'Rustic Village', 0, 0)
    placeSite(g, p, 'Rustic Village', 4, 3)
    expect(validateSummonAt(g, p, 'The Ninth Legion', { x: 0, y: 0, region: 'surface' }), 'enemy corner').not.toBeNull()
    expect(validateSummonAt(g, p, 'The Ninth Legion', { x: 4, y: 3, region: 'surface' }), 'own corner').toBeNull()
    expect(validateSummonAt(g, p, 'The Ninth Legion', { x: 4, y: 0, region: 'void' }), 'void corner').toBeNull()
    placeSite(g, p, 'Rustic Village', 2, 2)
    expect(validateSummonAt(g, p, 'The Ninth Legion', { x: 2, y: 2, region: 'surface' }), 'not a corner').not.toBeNull()
  })

  it('Valor and Dodge Roll cannot be cast with nothing to respond to', () => {
    const { g, p } = setup()
    fillSites(g, p)
    g.players[p].mana += 20
    for (const name of ['Valor', 'Dodge Roll']) {
      const id = injectToHand(g, p, name)
      const r = canCast(g, p, id, g.players[p].avatarUnitId)
      expect(r.ok, name).toBe(false)
    }
  })

  it('Joust! and Duel reject an enemy that is not adjacent to the chosen ally', () => {
    for (const name of ['Joust!', 'Duel']) {
      const { g, p, q } = setup()
      fillSites(g, p)
      const ally = summonCard(g, p, 'Foot Soldier', 0, 0)
      const far = summonCard(g, q, 'Foot Soldier', 3, 2)
      castMagicFail(g, p, name, { targets: [ally.id, far.id] })
      expect(g.units[ally.id] && g.units[far.id], `${name}: nobody moved or fought`).toBeTruthy()
      expect(g.players[p].cemetery.some((c) => g.cards[c].name === name), `${name} was not spent`).toBe(false)
    }
  })

  it('the bot considers casting a Voidwalk minion into the void', () => {
    const { g, p } = setup()
    fillSites(g, p)
    for (const s of Object.values(g.sites)) if (s.x === 4 && s.y === 0) delete g.sites[s.id]
    expect(siteAt(g, 4, 0)).toBeFalsy()
    const id = injectToHand(g, p, 'The Ninth Legion')
    g.players[p].mana += 20
    waiveThreshold(g, p)
    const casts = expandActions(g, p).map((e) => e.action).filter((a: any) => a.t === 'castSpell' && a.cardId === id)
    expect(casts.some((a: any) => a.at?.region === 'void' && a.at.x === 4 && a.at.y === 0)).toBe(true)
  })
})
