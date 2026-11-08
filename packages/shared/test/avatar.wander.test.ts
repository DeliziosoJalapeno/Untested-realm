// An Avatar's one Tap each turn belongs on developing (a site played or drawn) while it has < 6 sites.
// Move & Attack taps it too — so roaming used to escape both avatarIdle (untapped only) and avatarWander.
// Now roaming while there's a site to play or draw costs avatarIdle (the site play it gave up) plus
// avatarWander; and the conduct is judged on my latest turn, so it still counts once my turn has ended.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, injectToHand } from './helpers'
import { explainEval, avatarConduct, applyJudge, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

const terms = (g: GameState, me: PlayerId = 0) => explainEval(g, me).terms as Record<string, number>

function setup(avatar = 'Sorcerer'): GameState {
  const g = newGame(); keepBoth(g)
  const av = g.units[g.players[0].avatarUnitId]
  av.name = avatar; g.cards[av.cardId].name = avatar
  applyJudge(g, 0, { k: 'placeSite', name: 'Spire', player: 0, x: 2, y: 0 })
  applyJudge(g, 0, { k: 'placeSite', name: 'Spire', player: 0, x: 2, y: 1 })
  return g
}
const walk = (g: GameState) => {
  const av = g.units[g.players[0].avatarUnitId]
  act(g, 0, { t: 'moveAttack', unitId: av.id, path: [{ x: av.x, y: av.y + 1, region: 'surface' }] })
}

describe('a roaming Avatar while developing', () => {
  it('moving instead of developing costs the lost site play and the wander', () => {
    const g = setup()
    injectToHand(g, 0, 'Spire')
    walk(g)
    expect(terms(g).avatarIdle).toBeLessThan(0)
    expect(terms(g).avatarWander).toBeLessThan(0)
  })

  it('playing a site instead costs neither', () => {
    const g = setup()
    const site = injectToHand(g, 0, 'Spire')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: site, x: 1, y: 0 })
    expect(terms(g).avatarIdle ?? 0).toBe(0)
    expect(terms(g).avatarWander ?? 0).toBe(0)
  })

  it('with nothing to develop (no site in hand, empty atlas) roaming is free', () => {
    const g = setup()
    g.players[0].atlas = []
    g.players[0].hand = []
    walk(g)
    expect(terms(g).avatarIdle ?? 0).toBe(0)
    expect(terms(g).avatarWander ?? 0).toBe(0)
  })

  it('the conduct still counts once my turn has ended (the opponent to play)', () => {
    const g = setup()
    injectToHand(g, 0, 'Spire')
    walk(g)
    act(g, 0, { t: 'endTurn' })
    expect(g.activePlayer).toBe(1)
    expect(avatarConduct(g, 0)).toBeLessThan(0)
    expect(terms(g).avatarWander).toBeLessThan(0)
  })

  it('a Pathfinder that walks instead of blazing is penalised too', () => {
    const g = setup('Pathfinder')
    walk(g)
    expect(terms(g).pathfinderIdle).toBeLessThan(0)
    expect(terms(g).pathfinderWander).toBeLessThan(0)
  })
})
