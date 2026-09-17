import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer } from './helpers'
import { getScript, makeCtx, type GameState, type PlayerId } from '../src'

function injectHand(g: GameState, player: PlayerId, name: string): string {
  const id = `h${g.nextId++}`
  ;(g.cards as any)[id] = { id, name, owner: player }
  g.players[player].hand.push(id)
  return id
}
const ghouls = (g: GameState) => Object.values(g.units).filter((u) => u.name === 'Ghoul').length

describe('Monstermorphosis + Corruptor: your Beasts in hand count as Monsters', () => {
  it('offers a hand Beast as a valid Monster, and gates the collection option on ownership', () => {
    const g = newGame(); keepBoth(g)
    g.units[g.players[0].avatarUnitId].name = 'Corruptor'
    injectHand(g, 0, 'Beast of Burden') // printed Beast → Monster via Corruptor
    const victim = summonCard(g, 1, 'Foot Soldier', 2, 2); victim.disabled = true
    g.flow = { ...(g.flow ?? {}), morphoses: [{ unitId: victim.id, player: 0, turn: g.turn - 1 }] } as any
    g.players[0].collection = {} // no Horrible Hybrids

    getScript('Monstermorphosis')!.startOfTurn!(makeCtx(g, '', 0, []))
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseOption')
    expect(p!.data.options).toContain('Beast of Burden') // the Beast qualifies as a Monster
    expect(p!.data.options).not.toContain('Horrible Hybrids (collection)') // own none
  })

  it('offers Horrible Hybrids only when one is actually in your collection', () => {
    const g = newGame(); keepBoth(g)
    const victim = summonCard(g, 1, 'Foot Soldier', 2, 2); victim.disabled = true
    g.flow = { ...(g.flow ?? {}), morphoses: [{ unitId: victim.id, player: 0, turn: g.turn - 1 }] } as any
    g.players[0].collection = { 'Horrible Hybrids': 1 }
    getScript('Monstermorphosis')!.startOfTurn!(makeCtx(g, '', 0, []))
    expect(g.prompts[0]!.data.options).toContain('Horrible Hybrids (collection)')
  })
})

describe('summon-from-collection requires the card to actually be in your collection', () => {
  it('Young Master Damion summons no Ghouls from an empty collection; consumes when present', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const damion = summonCard(g, 0, 'Young Master Damion', 2, 2)

    g.players[0].collection = {}
    getScript('Young Master Damion')!.genesis!(makeCtx(g, damion.id, 0, []))
    expect(ghouls(g)).toBe(0) // nothing to summon

    g.players[0].collection = { Ghoul: 1 } // only one copy → only one crawls out
    getScript('Young Master Damion')!.genesis!(makeCtx(g, damion.id, 0, []))
    expect(ghouls(g)).toBe(1)
    expect(g.players[0].collection.Ghoul ?? 0).toBe(0) // consumed
  })

  it('Those Who Linger raises no Ghoul from an empty collection; consumes when present', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const linger = summonCard(g, 0, 'Those Who Linger', 2, 2)

    g.players[0].collection = {}
    getScript('Those Who Linger')!.deathrite!(makeCtx(g, linger.id, 0, []))
    expect(ghouls(g)).toBe(0)

    g.players[0].collection = { Ghoul: 2 }
    getScript('Those Who Linger')!.deathrite!(makeCtx(g, linger.id, 0, []))
    expect(ghouls(g)).toBe(1)
    expect(g.players[0].collection.Ghoul).toBe(1) // exactly one consumed
  })

  it('Estranged Loner (fromCollection helper) summons nothing from an empty collection', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const loner = summonCard(g, 0, 'Estranged Loner', 2, 2)
    g.players[0].collection = {}
    getScript('Estranged Loner')!.deathrite!(makeCtx(g, loner.id, 0, []))
    answer(g, true) // "yes, summon Horrible Hybrids here"
    expect(Object.values(g.units).filter((u) => u.name === 'Horrible Hybrids').length).toBe(0)
  })
})
