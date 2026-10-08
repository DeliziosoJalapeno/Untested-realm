// Bureau of Occult Control: "players pay (2) to access a cemetery or collection." That toll must apply
// to board abilities that reach into a cemetery — Deathspeaker's echo and a bone-raiser's raise.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, act, answer } from './helpers'
import { avatarOf } from '../src'
import '../src/cards/scripts/index'

function drain(g: any) {
  let guard = 0
  while (g.prompts.length && guard++ < 40) {
    const p: any = g.prompts[0]
    if (p.kind === 'chooseOption') answer(g, p.data.options[0])
    else if (p.kind === 'chooseSquare') answer(g, p.data.squares[0])
    else if (p.kind === 'chooseTargets') answer(g, [p.data.candidates[0]])
    else if (p.kind === 'chooseCards') answer(g, Array.from({ length: p.data.pick ?? 1 }, (_, i) => i))
    else if (p.kind === 'nameCard') answer(g, p.data.names[0])
    else answer(g, true)
  }
}

function deadMinionInCemetery(g: any, player: 0 | 1, name: string): string {
  const cid = `ctest${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: player }
  g.players[player].cemetery.push(cid)
  return cid
}

describe('Bureau of Occult Control tolls cemetery-reaching abilities', () => {
  it('Deathspeaker: echoing a 0-cost dead minion costs (2) with the Bureau in play', () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); (av as any).name = 'Deathspeaker'; av.x = 2; av.y = 2
    placeSite(g, 0, 'Rustic Village', 2, 2) // somewhere the echo can land
    placeSite(g, 0, 'Bureau of Occult Control', 0, 0)
    deadMinionInCemetery(g, 0, 'Foot Soldiers') // cost 0
    g.players[0].mana = 10

    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'speak' })
    drain(g)

    expect(g.players[0].mana, '0 (Foot Soldiers) + 2 (Bureau toll) spent').toBe(8)
  })

  it('Bone Jumble: the raise costs (1)+(2)=3 with the Bureau in play', () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0)
    placeSite(g, 0, 'Bureau of Occult Control', 0, 0)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    summonCard(g, 0, 'Skeleton', 2, 2).enteredTurn = -1 // sacrificeable (on a site)
    const cid = deadMinionInCemetery(g, 0, 'Bone Jumble')
    g.players[0].mana = 10

    act(g, 0, { t: 'activate', sourceId: av.id, ability: `boneRaise:${cid}` })
    drain(g)

    expect(g.players[0].mana, '1 (raise) + 2 (Bureau toll) = 3 spent').toBe(7)
  })

  it('Archimago: the Bureau adds exactly its (2) toll to the echo', () => {
    // isolate the toll from whatever the echoed copy itself costs by comparing with vs. without the Bureau.
    const spent = (withBureau: boolean) => {
      const g = newGame(); keepBoth(g)
      const av = avatarOf(g, 0); (av as any).name = 'Archimago'; av.x = 2; av.y = 2
      if (withBureau) placeSite(g, 0, 'Bureau of Occult Control', 0, 0)
      placeSite(g, 0, 'Rustic Village', 2, 2)
      for (let i = 0; i < 3; i++) deadMinionInCemetery(g, 0, 'Minor Explosion')
      g.players[0].mana = 10
      act(g, 0, { t: 'activate', sourceId: av.id, ability: 'echo' })
      drain(g)
      return 10 - g.players[0].mana
    }
    expect(spent(true) - spent(false), 'the Bureau adds its (2) cemetery toll').toBe(2)
  })

  it('Toolbox: fetching an Ordinary spell from your collection also pays the (2) toll', () => {
    const spent = (withBureau: boolean) => {
      const g = newGame(); keepBoth(g)
      placeSite(g, 0, 'Rustic Village', 2, 2)
      if (withBureau) placeSite(g, 0, 'Bureau of Occult Control', 0, 0)
      const bearer = summonCard(g, 0, 'Foot Soldiers', 2, 2); bearer.enteredTurn = -1
      const tb = giveArtifact(g, bearer, 'Toolbox')
      g.players[0].collection = { 'Minor Explosion': 1 }
      g.players[0].mana = 10
      g.flow = { ...(g.flow ?? {}), noThreshold: { 0: g.turn } } as any // waive the fetched spell's threshold
      act(g, 0, { t: 'activate', sourceId: tb.id, ability: 'rummage' })
      drain(g)
      return 10 - g.players[0].mana
    }
    expect(spent(true) - spent(false), 'the Bureau adds its (2) collection toll').toBe(2)
  })

  it('Archimago: without enough mana for the toll, the echo is blocked (nothing banished)', () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); (av as any).name = 'Archimago'
    placeSite(g, 0, 'Bureau of Occult Control', 0, 0)
    for (let i = 0; i < 3; i++) deadMinionInCemetery(g, 0, 'Minor Explosion')
    g.players[0].mana = 1 // less than the (2) toll

    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'echo' })

    expect(g.prompts.length, 'the echo was gated — no card-pick prompt').toBe(0)
    expect(g.players[0].cemetery.length, 'the three magics are still in the cemetery').toBe(3)
  })
})
