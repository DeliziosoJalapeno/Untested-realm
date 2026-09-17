import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, answer } from './helpers'
import { getScript, makeCtx, avatarOf, type GameState } from '../src'
import { drawCards } from '../src/engine/effects'
import '../src/cards/scripts/index'

function groundArt(g: GameState, name: string, x: number, y: number, owner = 0) {
  const cid = `c${g.nextId++}`; g.cards[cid] = { id: cid, name, owner } as any
  const aid = `a${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name, conjuredBy: owner, x, y, region: 'surface', carriedBy: null, tapped: false } as any
}

describe('Deathspeaker sees dead minions in EITHER cemetery', () => {
  it("offers a minion sitting in the opponent's cemetery", () => {
    const g: GameState = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.name = 'Deathspeaker'
    const cid = `c${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Bone Jumble', owner: 1 } as any
    g.players[1].cemetery.push(cid) // a dead minion in the OPPONENT's cemetery
    getScript('Deathspeaker')!.abilities![0].effect(makeCtx(g, av.id, 0, []))
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('chooseOption')
    expect(p.data.options, "the opponent's dead minion is offered").toContain('Bone Jumble')
  })
})

describe('Skeleton Mage CASTS the exhumed magic (not lent to hand)', () => {
  it('removes the Ordinary magic from the cemetery and banishes it, never putting it in hand', () => {
    const g: GameState = newGame(); keepBoth(g)
    const cid = `c${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Bless', owner: 0 } as any
    g.players[0].cemetery.push(cid)
    g.players[0].mana = 20
    const mage = summonCard(g, 0, 'Skeleton Mage', 2, 2)
    getScript('Skeleton Mage')!.genesis!(makeCtx(g, mage.id, 0, []))
    answer(g, [0]) // take up the Bless
    expect(g.players[0].cemetery, 'removed from the cemetery').not.toContain(cid)
    expect(g.players[0].banished, 'banished afterward').toContain(cid)
    expect(g.players[0].hand, 'NOT lent to hand').not.toContain(cid)
  })
})

describe('Chains of Prometheus re-triggers on every draw this turn', () => {
  it('taps a strongest minion on each draw', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    groundArt(g, 'Chains of Prometheus', 4, 4, 0)
    const strong = summonCard(g, 0, 'Stygian Archers', 1, 1); strong.enteredTurn = -5; strong.tapped = false // 3/3
    const weak = summonCard(g, 0, 'Bone Jumble', 2, 1); weak.enteredTurn = -5; weak.tapped = false // 1/1
    drawCards(g, 0, 'spellbook', 1)
    expect(strong.tapped, 'first draw taps the strongest').toBe(true)
    expect(weak.tapped, 'the weaker one is still up').toBe(false)
    drawCards(g, 0, 'spellbook', 1)
    expect(weak.tapped, 'a SECOND draw this turn taps again').toBe(true)
  })
})
