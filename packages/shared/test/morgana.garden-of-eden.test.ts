// Garden of Eden: "Players can't draw more than one spell each turn." FAQ (codex): this DOES affect
// caster-locked draws — "spells drawn by things like Morgana le Fay and the Omphaloi ... count as
// being drawn by the player, and will count against the one spell that can be drawn per turn."
// So Morgana's "draw a hand of three" is capped at ONE while a Garden of Eden is in play. The bug:
// drawLocked() pulled straight from the spellbook, bypassing the Garden gate entirely.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { makeCtx } from '../src/engine/effects'
import { getScript } from '../src/cards/scripts/registry'
import '../src/cards/scripts/index'

function seedSpellbook(g: any, n: number): void {
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const id = `csb${g.nextId++}`
    g.cards[id] = { id, name: 'Fireball', owner: 0 }
    ids.push(id)
  }
  g.players[0].spellbook.unshift(...ids) // on top
}

function fireMorgana(g: any, morgana: any): void {
  const ctx = makeCtx(g, morgana.id, 0, [])
  getScript('Morgana le Fay')!.genesis!(ctx)
}

describe('Garden of Eden caps Morgana le Fay (caster-locked draws count)', () => {
  it('without a Garden, Morgana draws her full hand of three', () => {
    const g: any = newGame(); keepBoth(g); g.turn = 3
    seedSpellbook(g, 5)
    const before = g.players[0].hand.length
    const morgana = summonCard(g, 0, 'Morgana le Fay', 2, 1); morgana.enteredTurn = -1
    fireMorgana(g, morgana)
    expect(g.players[0].hand.length - before, 'three spells drawn into her hand').toBe(3)
    expect((g.flow.lockedCards ?? []).length, 'three locked cards').toBe(3)
  })

  it('with a Garden of Eden in play, Morgana draws only one (FAQ)', () => {
    const g: any = newGame(); keepBoth(g); g.turn = 3
    seedSpellbook(g, 5)
    placeSite(g, 1, 'Garden of Eden', 0, 0) // opponent's Garden still limits player 0
    const before = g.players[0].hand.length
    const morgana = summonCard(g, 0, 'Morgana le Fay', 2, 1); morgana.enteredTurn = -1
    fireMorgana(g, morgana)
    expect(g.players[0].hand.length - before, 'only one spell slips into her hand').toBe(1)
    expect((g.flow.lockedCards ?? []).length, 'and only one locked card').toBe(1)
  })

  it('if the player already drew a spell this turn, Morgana draws none under the Garden', () => {
    const g: any = newGame(); keepBoth(g); g.turn = 3
    seedSpellbook(g, 5)
    placeSite(g, 0, 'Garden of Eden', 0, 0)
    g.flow = g.flow ?? {}; g.flow.spellDraws = { 0: 1, 1: 0 } // already spent the one allowed draw
    const before = g.players[0].hand.length
    const morgana = summonCard(g, 0, 'Morgana le Fay', 2, 1); morgana.enteredTurn = -1
    fireMorgana(g, morgana)
    expect(g.players[0].hand.length - before, 'no further spell draws allowed').toBe(0)
  })
})
