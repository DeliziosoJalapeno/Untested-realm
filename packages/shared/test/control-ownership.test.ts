// Two "who controls/owns this?" bugs:
//  · Detonate "destroy a minion or artifact you OWN or control" — a minion of yours an enemy has
//    infiltrated (you still own the card) must be a legal target (reported: Siege Giant + Detonate).
//  · Activating a stolen artifact — a carried artifact is controlled by its BEARER, not its original
//    conjurer, so a Toolbox you took from the opponent is yours to use (reported: "says you don't control it").
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { makeCtx, getScript, avatarOf, type GameState } from '../src'
import { canActivate } from '../src/engine/game'
import '../src/cards/scripts/index'

describe('Detonate targets cards you OWN even when an enemy controls them', () => {
  it('offers your infiltrated minion, but not a purely enemy minion', () => {
    const g: GameState = newGame(); keepBoth(g)
    const giant = summonCard(g, 0, 'Siege Giant', 2, 2) // you own the card…
    giant.controller = 1                                 // …but the enemy infiltrated it
    const enemy = summonCard(g, 1, 'Foot Soldier', 3, 2) // enemy owns AND controls this

    getScript('Detonate')!.onCast!(makeCtx(g, avatarOf(g, 0).id, 0, []))
    const cands = (g.prompts[0]?.data as any).candidates as string[]

    expect(cands, 'your infiltrated Siege Giant is detonatable').toContain(giant.id)
    expect(cands, "but not the enemy's own minion").not.toContain(enemy.id)
  })
})

describe('Activating a stolen (carried) artifact', () => {
  function carriedArtifact(g: GameState, name: string, bearerId: string, conjuredBy: number): string {
    const cid = `ctest${g.nextId++}`
    g.cards[cid] = { id: cid, name, owner: conjuredBy } as any
    const aid = `atest${g.nextId++}`
    const bearer = g.units[bearerId]
    g.artifacts[aid] = { id: aid, cardId: cid, name, conjuredBy, x: bearer.x, y: bearer.y, region: bearer.region, carriedBy: bearerId, tapped: false } as any
    bearer.carrying.push(aid)
    return aid
  }

  it('a Toolbox stolen from the opponent (now carried by your unit) is yours to use', () => {
    const g: GameState = newGame(); keepBoth(g)
    const myUnit = summonCard(g, 0, 'Foot Soldier', 2, 2)
    const stolen = carriedArtifact(g, 'Toolbox', myUnit.id, 1) // conjured by the opponent, carried by you

    expect(canActivate(g, 0, stolen, 'rummage'), 'bearer controls it → not a control error')
      .not.toBe('You do not control that.')
  })

  it('control: a ground artifact still conjured/controlled by the opponent is NOT yours', () => {
    const g: GameState = newGame(); keepBoth(g)
    const cid = `ctest${g.nextId++}`
    g.cards[cid] = { id: cid, name: 'Toolbox', owner: 1 } as any
    const aid = `atest${g.nextId++}`
    g.artifacts[aid] = { id: aid, cardId: cid, name: 'Toolbox', conjuredBy: 1, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any

    expect(canActivate(g, 0, aid, 'rummage')).toBe('You do not control that.')
  })
})
