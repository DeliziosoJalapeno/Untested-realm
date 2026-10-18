// Deathspeaker's echo is a CAST: it must meet the copied minion's threshold (FAQ: "At Death's Door, does the
// Deathspeaker need to meet the threshold requirements? Yes. Only the casting cost is reduced to (0).").
// Tournament Grounds waives threshold for every Knight/Sir/Dame cast onto it — the plural Vanguard Knights
// included, matching its "anyone may cast them here" rule.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, injectToHand, waiveThreshold } from './helpers'
import { getScript, makeCtx, avatarOf, applyAction, affinity, type GameState } from '../src'
import { allCards } from '../src/cards/db'
import '../src/cards/scripts/index'

// a fire-hungry minion with no Genesis (so the echo resolves without extra prompts)
const FIERY = allCards.find((c) => c.type === 'Minion' && (c.thresholds.fire ?? 0) >= 2 && !getScript(c.name)?.genesis)!.name

function deathspeakerWithDead(name: string): { g: GameState; avId: string } {
  const g = newGame(); keepBoth(g)
  const av = avatarOf(g, 0); av.name = 'Deathspeaker'
  placeSite(g, 0, 'Rustic Village', av.x, av.y)
  const cid = `c${g.nextId++}`; g.cards[cid] = { id: cid, name, owner: 0 } as any
  g.players[0].cemetery.push(cid)
  g.players[0].mana = 20
  return { g, avId: av.id }
}

describe('Deathspeaker: the echo must meet the threshold', () => {
  it('does not offer a dead minion whose threshold you lack', () => {
    const { g, avId } = deathspeakerWithDead(FIERY)
    expect(affinity(g, 0).fire, 'no fire affinity').toBe(0)
    getScript('Deathspeaker')!.abilities![0].effect(makeCtx(g, avId, 0, []))
    expect(g.prompts.length, 'nothing to choose').toBe(0)
    expect(g.log.at(-1)?.msg).toMatch(/threshold/)
    expect(g.players[0].cemetery.length, 'the dead minion stays put').toBe(1)
  })

  it('offers and echoes it once the threshold is met (here: waived for the turn)', () => {
    const { g, avId } = deathspeakerWithDead(FIERY)
    waiveThreshold(g, 0)
    getScript('Deathspeaker')!.abilities![0].effect(makeCtx(g, avId, 0, []))
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('chooseOption')
    expect(p.data.options).toContain(FIERY)
  })
})

describe('Tournament Grounds waives threshold for Knights, Sirs and Dames cast onto it', () => {
  it('covers the plural Vanguard Knights', () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0)
    const grounds = placeSite(g, 1, 'Tournament Grounds', av.x, av.y === 0 ? 1 : av.y - 1) // anyone's Grounds
    placeSite(g, 0, 'Accursed Tower', av.x, av.y) // no earth here, so the control cast must fail
    g.players[0].mana = 20
    expect(affinity(g, 0).earth, 'no earth affinity').toBe(0)
    const control = injectToHand(g, 0, 'Vanguard Knights')
    expect(applyAction(g, 0, { t: 'castSpell', cardId: control, casterId: av.id, at: { x: av.x, y: av.y, region: 'surface' } } as any).ok,
      'needs its threshold anywhere else').toBe(false)
    const r = applyAction(g, 0, { t: 'castSpell', cardId: control, casterId: av.id, at: { x: grounds.x, y: grounds.y, region: 'surface' } } as any)
    expect(r.ok, String(r.error)).toBe(true)
  })
})
