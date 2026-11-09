// Rat King's rats each go to the adjacent site their player picks, one rat at a time
// (TonyTheMill, 2026-11-08), instead of filling the adjacent sites in a fixed order.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, castMagic, fillSites, waiveThreshold, answer } from './helpers'

describe('Rat King', () => {
  it('asks where each chosen rat goes and summons every one, the rest to the bottom', () => {
    const g: any = newGame(); keepBoth(g); fillSites(g); waiveThreshold(g, 0)
    const p = g.players[0]
    const ids = ['Sewer Rats', 'Granary Rats', 'Brown Bears', 'Plague Rat', 'Brown Bears', 'Brown Bears'].map((name, i) => {
      const id = `rk${i}`
      g.cards[id] = { id, name, owner: 0 }
      return id
    })
    p.spellbook = [...ids, ...p.spellbook]
    castMagic(g, 0, 'Rat King', { at: { x: 2, y: 1 } })
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    answer(g, [0, 1, 3])
    const placed: { x: number; y: number }[] = []
    for (let i = 0; i < 2; i++) {
      expect(g.prompts[0]?.kind).toBe('chooseSquare')
      const squares = g.prompts[0].data.squares as { x: number; y: number }[]
      // pick the last open square each time, never the first fixed one
      const pick = squares[squares.length - 1]
      placed.push(pick)
      answer(g, pick)
    }
    // the third rat: asked again unless only one site is left
    while (g.prompts[0]?.kind === 'chooseSquare') answer(g, g.prompts[0].data.squares[0])
    const rats = Object.values(g.units).filter((u: any) => /rat/i.test(u.name) && u.name !== 'Rat King') as any[]
    expect(rats.map((u) => u.name).sort()).toEqual(['Granary Rats', 'Plague Rat', 'Sewer Rats'])
    expect(rats.find((u) => u.name === 'Sewer Rats')).toMatchObject(placed[0])
    expect(rats.find((u) => u.name === 'Granary Rats')).toMatchObject(placed[1])
    // the three Brown Bears went to the bottom, none of the rats is left in the spellbook
    expect(p.spellbook.slice(-3).map((id: string) => g.cards[id].name)).toEqual(['Brown Bears', 'Brown Bears', 'Brown Bears'])
    expect(p.spellbook.some((id: string) => ['rk0', 'rk1', 'rk3'].includes(id))).toBe(false)
  })
})
