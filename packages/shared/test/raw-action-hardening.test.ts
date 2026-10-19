// The engine is the only referee: other sites embed it with their own clients, and our own bot only
// over-generates answers and lets the engine filter them. Every rule the UI enforces by offering only
// legal choices must ALSO be rejected when a raw action breaks it. One test per hole found in the
// audit (2026-10-19); each raw action below used to return { ok: true }.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, summonCard, act, actFail, answer, castMagicFail, injectToHand, waiveThreshold } from './helpers'
import { applyAction, avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame(); keepBoth(g); fillSites(g)
  return g
}
const answerFail = (g: GameState, choice: unknown) => actFail(g, g.prompts[0].player, { t: 'prompt', promptId: g.prompts[0].id, choice })

describe('casting extras the engine used to trust', () => {
  it('castRegion is only for a SITE caster (it re-stamped a validated surface target underground)', () => {
    const g = board(); waiveThreshold(g, 0)
    const cardId = injectToHand(g, 0, 'Minor Explosion'); g.players[0].mana += 20
    const av = avatarOf(g, 0)
    const err = actFail(g, 0, { t: 'castSpell', cardId, casterId: av.id, targets: [`sq:${av.x},${av.y + 1},surface`], extra: { castRegion: 'underground' } })
    expect(err).toMatch(/site caster/)
  })

  it('castOrigin must be one of the caster\'s own squares', () => {
    const g = board(); waiveThreshold(g, 0)
    const cardId = injectToHand(g, 0, 'Magic Missiles'); g.players[0].mana += 20
    const err = actFail(g, 0, { t: 'castSpell', cardId, casterId: avatarOf(g, 0).id, extra: { direction: 'n', castOrigin: { x: 4, y: 3 } } })
    expect(err).toMatch(/own squares/)
  })

  it('targets past the declared specs are refused', () => {
    const g = board(); waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    const err = castMagicFail(g, 0, 'Minor Explosion', { targets: [`sq:${av.x},${av.y},surface`, `sq:${av.x},${av.y + 1},surface`] })
    expect(err).toMatch(/Too many targets/)
  })

  it('an artifact is conjured on the surface only', () => {
    const g = board(); waiveThreshold(g, 0)
    const cardId = injectToHand(g, 0, 'Ruby Core'); g.players[0].mana += 20
    const av = avatarOf(g, 0)
    const err = actFail(g, 0, { t: 'castSpell', cardId, casterId: av.id, at: { x: av.x, y: av.y, region: 'underground' } })
    expect(err).toMatch(/surface/)
  })

  it('a summon square must be on the board', () => {
    const g = board(); waiveThreshold(g, 0)
    const cardId = injectToHand(g, 0, 'Bone Jumble'); g.players[0].mana += 20
    const err = actFail(g, 0, { t: 'castSpell', cardId, casterId: avatarOf(g, 0).id, at: { x: 99, y: 99, region: 'void' } })
    expect(err).toMatch(/Out of bounds/)
  })
})

describe('Ranged', () => {
  it('a 1x1 shooter cannot fire from a square it does not occupy', () => {
    const g = board()
    const shooter = summonCard(g, 0, 'Belmotte Longbowmen', 0, 0); shooter.enteredTurn = -5
    const victim = summonCard(g, 1, 'Bone Jumble', 4, 3)
    const err = actFail(g, 0, { t: 'activate', sourceId: shooter.id, ability: 'ranged', extra: { direction: 'n', origin: { x: 4, y: 3 } } })
    expect(err).toMatch(/own squares/)
    expect(g.units[victim.id]).toBeDefined()
  })

  it('"which unit does the shot hit" only accepts a unit the shot reached', () => {
    const g = board()
    const shooter = summonCard(g, 0, 'Belmotte Longbowmen', 2, 1); shooter.enteredTurn = -5
    const a = summonCard(g, 1, 'Bone Jumble', 2, 2)
    summonCard(g, 1, 'Bone Jumble', 2, 2)
    const far = summonCard(g, 1, 'Bone Jumble', 0, 3)
    act(g, 0, { t: 'activate', sourceId: shooter.id, ability: 'ranged', extra: { direction: 'n' } })
    expect(answerFail(g, [far.id])).toMatch(/offered/)
    expect(g.units[far.id]).toBeDefined()
    answer(g, [a.id]) // the prompt is still open for a legal pick
    expect(g.units[a.id]).toBeUndefined()
  })
})

describe('combat prompts', () => {
  function attackIntoTwo() {
    const g = board()
    const atk = summonCard(g, 0, 'Stygian Archers', 2, 1); atk.enteredTurn = -5
    const d1 = summonCard(g, 1, 'Bone Jumble', 2, 1); d1.enteredTurn = -5
    const d2 = summonCard(g, 1, 'Bone Jumble', 2, 1); d2.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: atk.id, path: [], attack: { unit: d1.id } })
    answer(g, [d2.id]) // d2 defends
    while (g.prompts[0]?.kind === 'stayInFight') answer(g, true)
    return { g, atk, d1, d2 }
  }

  it('damage can only be allocated to units in the fight', () => {
    const { g, atk } = attackIntoTwo()
    expect(g.prompts[0].kind).toBe('allocateDamage')
    const foeAvatar = avatarOf(g, 1)
    const life = foeAvatar.life
    expect(answerFail(g, { strikerId: atk.id, allocation: { [foeAvatar.id]: 3 } })).toMatch(/in the fight/)
    expect(foeAvatar.life).toBe(life)
  })

  it('an allocation names the striker that was asked for, not another one', () => {
    const { g, d1 } = attackIntoTwo()
    expect(answerFail(g, { strikerId: d1.id, allocation: {} })).toMatch(/striking unit/)
  })

  it('a unit that can never defend cannot be sent to defend', () => {
    const g = board()
    const atk = summonCard(g, 0, 'Stygian Archers', 2, 1); atk.enteredTurn = -5
    const d1 = summonCard(g, 1, 'Bone Jumble', 2, 1)
    const specter = summonCard(g, 1, 'Recurring Specter', 2, 1)
    summonCard(g, 1, 'Bone Jumble', 2, 1)
    act(g, 0, { t: 'moveAttack', unitId: atk.id, path: [], attack: { unit: d1.id } })
    expect(g.prompts[0].data.candidates).not.toContain(specter.id)
    expect(answerFail(g, [specter.id])).toMatch(/offered/)
    expect(g.units[specter.id].tapped).toBe(false)
  })

  it('a unit that cannot intercept is refused', () => {
    const g = board()
    const mover = summonCard(g, 0, 'Bone Jumble', 2, 1); mover.enteredTurn = -5
    summonCard(g, 1, 'Bone Jumble', 2, 2)
    const giant = summonCard(g, 1, 'Lumbering Giant', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: mover.id, path: [{ x: 2, y: 2, region: 'surface' }] })
    expect(g.prompts[0].kind).toBe('intercept')
    expect(answerFail(g, giant.id)).toMatch(/offered/)
    expect(g.units[giant.id].tapped).toBe(false)
  })
})

describe('other actions', () => {
  it('a mulligan cannot return the same card twice', () => {
    const g = newGame()
    const id = g.players[0].hand[0]
    expect(applyAction(g, 0, { t: 'mulligan', back: [id, id, id] }).ok).toBe(false)
    expect(g.players[0].hand).toContain(id)
  })

  it('addTime needs a real seat and a number', () => {
    const g = newGame(); keepBoth(g)
    g.clock = { base: 900000, inc: 30000, remaining: [900000, 800000] } as any
    expect(applyAction(g, 0, { t: 'addTime', player: 1, ms: 'abc' as any }).ok).toBe(false)
    expect(applyAction(g, 0, { t: 'addTime', player: 5 as any, ms: 1000 }).ok).toBe(false)
    expect(g.clock!.remaining).toEqual([900000, 800000])
  })

  it('pickUp cannot name the same artifact twice', () => {
    const g = board()
    const u = summonCard(g, 0, 'Bone Jumble', 2, 1)
    g.cards.ctestA = { id: 'ctestA', name: 'Ruby Core', owner: 0 }
    g.artifacts.atestA = { id: 'atestA', cardId: 'ctestA', name: 'Ruby Core', conjuredBy: 0, x: 2, y: 1, region: 'surface', carriedBy: null, tapped: false } as any
    expect(applyAction(g, 0, { t: 'pickUp', unitId: u.id, artifactIds: ['atestA', 'atestA'] }).ok).toBe(false)
    expect(u.carrying).toEqual([])
  })
})

describe('malformed actions are refused, never thrown (fuzz_raw finds)', () => {
  const shapes: unknown[] = [
    { t: 'moveAttack', unitId: 'u1', path: false },
    { t: 'moveAttack', unitId: 'u1', path: [null] },
    { t: 'moveAttack', unitId: 'u1', path: [], attack: 'x' },
    { t: 'drop', unitId: 'u1', artifactIds: false },
    { t: 'castSpell', cardId: 'c1', casterId: 'u1', targets: ['sq:1,1,surface', 1e12] },
    { t: 'castSpell', cardId: 'c1', casterId: 'u1', targets: 'NaN' },
    { t: 'castSpell', cardId: 'c1', casterId: 'u1', at: { x: 'a', y: 1 } },
    { t: 'bogus' }, null, 'endTurn',
  ]
  for (const a of shapes) {
    it(`refuses ${JSON.stringify(a)}`, () => {
      const g = board()
      const r = applyAction(g, 0, a as any)
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/Malformed|Unknown/)
    })
  }
})
