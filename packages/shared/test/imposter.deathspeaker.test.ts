import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, giveMana, answer } from './helpers'
import { dealDamageToUnit, avatarOf, getScript, makeCtx, type GameState } from '../src'

// ── Imposter: mask breaks on ANY damage, not just attacks ───────────────────────
// "Gain their abilities until damaged…" — damage from spells / abilities / projectiles
// must crack the mask, not only combat. Avatars take damage via a branch of
// dealDamageToUnit that used to skip the onSelfDamaged hook the mask relies on.
describe('Imposter mask cracks on any damage source', () => {
  function maskedImposter(g: GameState) {
    const av = avatarOf(g, 0)
    av.name = 'Imposter'
    g.cards[av.cardId].name = 'Imposter'
    g.flow = g.flow ?? {}
    ;(g.flow as any).imposterMask = { 0: 'Battlemage' }
    return av
  }
  it('spell (magic) damage breaks the mask', () => {
    const g = newGame(); keepBoth(g)
    const av = maskedImposter(g)
    dealDamageToUnit(g, av, 2, 1, { source: { player: 1, kind: 'magic' } })
    expect((g.flow as any).imposterMask?.[0], 'mask cracked from spell damage').toBeUndefined()
  })
  it('ability/effect (e.g. Redbreast Robin, Heat Ray) damage breaks the mask', () => {
    const g = newGame(); keepBoth(g)
    const av = maskedImposter(g)
    dealDamageToUnit(g, av, 1, 1, { source: { player: 1, kind: 'effect' } })
    expect((g.flow as any).imposterMask?.[0]).toBeUndefined()
  })
  it('a single point of damage is enough', () => {
    const g = newGame(); keepBoth(g)
    const av = maskedImposter(g)
    dealDamageToUnit(g, av, 1, 1, { source: { player: 1, kind: 'strike' } as any })
    expect((g.flow as any).imposterMask?.[0]).toBeUndefined()
  })
})

// ── Deathspeaker: the player chooses where the flickered copy enters ─────────────
// so its Genesis (and any "when a creature enters nearby" triggers) resolve at the
// right spot, instead of always at the avatar's square.
describe('Deathspeaker flicker lets you choose the summon location', () => {
  it('offers a chooseSquare over the legal summon sites, then summons+banishes there', () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0)
    av.name = 'Deathspeaker'; g.cards[av.cardId].name = 'Deathspeaker'
    giveMana(g, 0, 10)
    // two sites you control → two legal summon squares
    placeSite(g, 0, 'Spire', 1, 1)
    placeSite(g, 0, 'Valley', 3, 2)
    // a dead minion in the cemetery
    const deadId = `dead${g.nextId++}`
    g.cards[deadId] = { id: deadId, name: 'Bone Jumble', owner: 0 }
    g.players[0].cemetery.push(deadId)

    getScript('Deathspeaker')!.abilities![0].effect(makeCtx(g, av.id, 0, []))
    // 1) which dead minion
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    answer(g, 'Bone Jumble')
    // 2) WHERE — the new location prompt
    expect(g.prompts[0]?.kind, 'now asks where the echo appears').toBe('chooseSquare')
    const squares = new Set((g.prompts[0]!.data.squares as { x: number; y: number }[]).map((s) => `${s.x},${s.y}`))
    expect(squares).toEqual(new Set(['1,1', '3,2']))
    answer(g, { x: 3, y: 2 })

    // the dead minion was banished (the cost), and its copy flickered in & back out
    expect(g.players[0].banished).toContain(deadId)
    expect(g.players[0].cemetery).not.toContain(deadId)
    expect(Object.values(g.units).some((u) => u.name === 'Bone Jumble'), 'the echo was banished again').toBe(false)
  })
})
