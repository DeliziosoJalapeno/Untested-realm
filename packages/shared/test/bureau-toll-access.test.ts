// Bureau of Occult Control: "Players must pay (2) to access a collection or cemetery." FAQ: access = a card
// LEAVING the zone (to the realm, hand, deck, or banished); the (2) is paid once, when the accessing effect
// goes on the storyline, by the player whose effect it is — your own cemetery too. Unpaid → the access
// part doesn't happen (the rest of the effect still does). Looking/counting is free.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, answer, castMagic, waiveThreshold } from './helpers'
import { getScript } from '../src'
import { makeCtx } from '../src/engine/effects'
import '../src/cards/scripts/index'

function deadCard(g: any, player: 0 | 1, name: string): string {
  const cid = `ctest${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: player }
  g.players[player].cemetery.push(cid)
  return cid
}

function setup(withBureau: boolean) {
  const g = newGame(); keepBoth(g)
  if (withBureau) placeSite(g, 0, 'Bureau of Occult Control', 0, 0)
  return g
}

describe('Bureau of Occult Control tolls every cemetery/collection access', () => {
  it('Raise Dead (cemetery summon): the Bureau adds exactly (2)', () => {
    const run = (withBureau: boolean) => {
      const g = setup(withBureau)
      placeSite(g, 0, 'Rustic Village', 2, 2)
      const dead = deadCard(g, 1, 'Foot Soldiers')
      waiveThreshold(g, 0)
      castMagic(g, 0, 'Raise Dead')
      const before = g.players[0].mana
      while (g.prompts.length) answer(g, { x: 2, y: 2 })
      const raised = Object.values(g.units).some((u) => u.cardId === dead)
      return { g, raised, before }
    }
    const without = run(false)
    const withB = run(true)
    expect(without.raised).toBe(true)
    expect(withB.raised).toBe(true)
    expect(without.g.players[0].mana - withB.g.players[0].mana, 'one (2) toll for the raise').toBe(2)
  })

  it('Pillar of Zeiros (banish): pays (2) once for every dead minion in both cemeteries', () => {
    const g = setup(true)
    const pillar = placeSite(g, 0, 'Pillar of Zeiros', 2, 2)
    deadCard(g, 0, 'Foot Soldiers'); deadCard(g, 1, 'Foot Soldiers'); deadCard(g, 1, 'Bone Jumble')
    g.players[0].mana = 5
    getScript('Pillar of Zeiros')!.genesis!(makeCtx(g, pillar.id, 0, []))
    expect(g.players[0].mana, 'a single (2) toll').toBe(3)
    expect(g.players[0].cemetery.length + g.players[1].cemetery.length).toBe(0)
    expect(g.players[1].banished.length).toBe(2)
  })

  it('Pillar of Zeiros: without the (2) the mandatory banish simply does not happen', () => {
    const g = setup(true)
    const pillar = placeSite(g, 0, 'Pillar of Zeiros', 2, 2)
    deadCard(g, 0, 'Foot Soldiers'); deadCard(g, 1, 'Foot Soldiers')
    g.players[0].mana = 1
    getScript('Pillar of Zeiros')!.genesis!(makeCtx(g, pillar.id, 0, []))
    expect(g.players[0].mana, 'nothing charged').toBe(1)
    expect(g.players[0].cemetery.length + g.players[1].cemetery.length, 'the dead stay put').toBe(2)
  })

  it('no Bureau in play → no toll', () => {
    const g = setup(false)
    const pillar = placeSite(g, 0, 'Pillar of Zeiros', 2, 2)
    deadCard(g, 0, 'Foot Soldiers'); deadCard(g, 1, 'Foot Soldiers')
    g.players[0].mana = 1
    getScript('Pillar of Zeiros')!.genesis!(makeCtx(g, pillar.id, 0, []))
    expect(g.players[0].mana).toBe(1)
    expect(g.players[0].cemetery.length + g.players[1].cemetery.length).toBe(0)
  })

  it('Bureau in play but no dead minion to take → nothing charged', () => {
    const g = setup(true)
    const pillar = placeSite(g, 0, 'Pillar of Zeiros', 2, 2)
    g.players[0].mana = 5
    getScript('Pillar of Zeiros')!.genesis!(makeCtx(g, pillar.id, 0, []))
    expect(g.players[0].mana).toBe(5)
  })

  it('Harvest Festival (collection fetch via from-collection): one (2) toll for both Townsfolk', () => {
    const run = (withBureau: boolean) => {
      const g = setup(withBureau)
      const site = placeSite(g, 0, 'Rustic Village', 2, 2)
      g.players[0].collection = { 'Eltham Townsfolk': 1, 'Serava Townsfolk': 1 }
      waiveThreshold(g, 0)
      castMagic(g, 0, 'Harvest Festival', { targets: [site.id] })
      while (g.prompts.length) answer(g, true)
      const n = Object.values(g.units).filter((u) => u.name.endsWith('Townsfolk')).length
      return { mana: g.players[0].mana, n }
    }
    const without = run(false)
    const withB = run(true)
    expect(withB.n).toBe(2)
    expect(without.mana - withB.mana).toBe(2)
  })

  it('Bone Rabble (cemetery-activated self-summon): pays (2) to climb out', () => {
    const g = setup(true)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2)
    const rabble = deadCard(g, 0, 'Bone Rabble')
    g.players[0].mana = 5
    getScript('Bone Rabble')!.onSitePlayed!(makeCtx(g, rabble, 0, []), 0, { id: site.id, x: 2, y: 2, name: 'Pillar of Zeiros' } as any)
    expect(g.prompts[0]?.kind).toBe('yesNo')
    answer(g, true)
    expect(g.players[0].mana).toBe(3)
    expect(Object.values(g.units).some((u) => u.cardId === rabble)).toBe(true)
  })

  it('Bone Rabble: cannot pay → stays in the cemetery', () => {
    const g = setup(true)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2)
    const rabble = deadCard(g, 0, 'Bone Rabble')
    g.players[0].mana = 1
    getScript('Bone Rabble')!.onSitePlayed!(makeCtx(g, rabble, 0, []), 0, { id: site.id, x: 2, y: 2, name: 'Pillar of Zeiros' } as any)
    answer(g, true)
    expect(g.players[0].mana).toBe(1)
    expect(g.players[0].cemetery).toContain(rabble)
  })

  it('Funeral Pyre (shared cemetery-choose helper): banishing three cards costs one (2)', () => {
    const g = setup(true)
    const pyre = placeSite(g, 0, 'Funeral Pyre', 2, 2)
    for (let i = 0; i < 3; i++) deadCard(g, 1, 'Foot Soldiers')
    g.players[0].mana = 5
    getScript('Funeral Pyre')!.genesis!(makeCtx(g, pyre.id, 0, []))
    answer(g, "opponent's")
    answer(g, [0, 1, 2])
    expect(g.players[1].cemetery.length).toBe(0)
    expect(g.players[0].mana).toBe(3)
  })

  it('Return to Nature: unpaid toll skips the return but still draws the spell', () => {
    const g = setup(true)
    const dead = deadCard(g, 0, 'Foot Soldiers')
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Return to Nature')
    const p = g.players[0]
    p.mana = 1
    const hand = p.hand.length
    answer(g, 'yours')
    answer(g, [p.cemetery.indexOf(dead)])
    expect(p.cemetery, 'the card stays in the cemetery').toContain(dead)
    expect(p.mana).toBe(1)
    expect(p.hand.length, 'the spell is still drawn').toBe(hand + 1)
  })
})
