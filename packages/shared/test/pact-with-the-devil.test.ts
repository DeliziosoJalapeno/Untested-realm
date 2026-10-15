// Pact with the Devil: "Sacrifice the caster or lose half your life…". The caster can be a minion, a
// spellcaster ARTIFACT (Omphalos) or a spellcaster SITE — all are valid sacrifice targets. Bug: the cont
// only looked in state.units, so sacrificing an artifact/site caster silently did nothing.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { makeCtx, getScript, type GameState } from '../src'

const sacrifice = (g: GameState, casterId: string) =>
  getScript('Pact with the Devil')!.conts!.pact(makeCtx(g, g.players[0].avatarUnitId, 0, []), { pactCasterId: casterId }, 'Sacrifice the caster')

describe('Pact with the Devil sacrifices any caster type', () => {
  it('sacrifices a MINION caster (regression)', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Hamlet', 2, 2)
    const m = summonCard(g, 0, 'Foot Soldier', 2, 2); m.enteredTurn = -1
    sacrifice(g, m.id)
    expect(g.units[m.id], 'the minion caster was sacrificed').toBeUndefined()
  })

  it('sacrifices a spellcaster ARTIFACT caster (Omphalos)', () => {
    const g: any = newGame(); keepBoth(g)
    const cid = `ctest${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Char Omphalos', owner: 0 }
    const aid = `atest${g.nextId++}`
    g.artifacts[aid] = { id: aid, cardId: cid, name: 'Char Omphalos', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false }
    sacrifice(g, aid)
    expect(g.artifacts[aid], 'the spellcaster artifact was sacrificed (broken)').toBeUndefined()
  })

  it('sacrifices a spellcaster SITE caster', () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'River of Flame', 2, 2)
    sacrifice(g, site.id)
    expect(g.sites[site.id], 'the spellcaster site was sacrificed (destroyed → rubble)').toBeUndefined()
    expect(Object.values(g.sites).some((s) => s.x === 2 && s.y === 2 && s.isRubble), 'left rubble').toBe(true)
  })
})
