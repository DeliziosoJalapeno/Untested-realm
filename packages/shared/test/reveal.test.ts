// Cards that publicly reveal cards (Common Sense's tutor, Black Mass) record the reveal in
// flow.reveals so the OPPONENT's client can pop a "revealed…" notice. The revealed names are
// public — viewFor exposes them to everyone.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, castMagic, answer, waiveThreshold } from './helpers'
import { viewFor } from '../src'

describe('public card reveals (flow.reveals)', () => {
  it('Common Sense records the revealed card, visible to both players', () => {
    const g: any = newGame(); keepBoth(g)
    waiveThreshold(g, 0)
    const ord = `cord${g.nextId++}`
    g.cards[ord] = { id: ord, name: 'Common Cottagers', owner: 0 } // an Ordinary card to tutor
    g.players[0].spellbook.unshift(ord)

    castMagic(g, 0, 'Common Sense') // opens a chooseOption of Ordinary matches
    answer(g, 'Common Cottagers') // pick it → revealed + put into hand

    const hit = (revs: any[]) => (revs ?? []).some((r) => r.by === 0 && r.names.includes('Common Cottagers'))
    expect(hit(g.flow.reveals), 'the reveal is recorded').toBe(true)
    expect(hit((viewFor(g, 1).flow as any)?.reveals), 'the opponent sees the revealed card').toBe(true)
    expect(hit((viewFor(g, 0).flow as any)?.reveals), 'the caster sees it too').toBe(true)
    // the tutored card really went to hand
    expect(g.players[0].hand.includes(ord)).toBe(true)
  })
})
