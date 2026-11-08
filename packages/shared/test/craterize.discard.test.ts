// Craterize: "As an additional cost, discard a site." A lone site in hand must be discarded, and a
// forced discard prompt can't be confirmed with nothing picked.
import { describe, it, expect } from 'vitest'
import { newGame, act, keepBoth, answer, fetchToHand, injectToHand, giveMana, waiveThreshold, placeSite } from './helpers'
import { getCard, resolvePrompt } from '../src'
import type { GameState } from '../src'

function setup(sites: string[]): { g: GameState; target: string; craterize: string } {
  const g = newGame()
  keepBoth(g)
  const v = fetchToHand(g, 0, 'Rustic Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v, x: 2, y: 0 })
  if (g.prompts.length) answer(g, false)
  const target = placeSite(g, 1, 'Stream', 2, 2).id
  g.players[0].hand = g.players[0].hand.filter((id) => getCard(g.cards[id].name).type !== 'Site')
  for (const s of sites) injectToHand(g, 0, s)
  waiveThreshold(g, 0)
  giveMana(g, 0, 10)
  return { g, target, craterize: injectToHand(g, 0, 'Craterize') }
}

const siteNames = (g: GameState, zone: 'hand' | 'cemetery') =>
  g.players[0][zone].map((id) => g.cards[id].name).filter((n) => getCard(n).type === 'Site')

describe('Craterize discard cost', () => {
  it('discards the only site in hand without asking', () => {
    const { g, target, craterize } = setup(['Spire'])
    act(g, 0, { t: 'castSpell', cardId: craterize, casterId: g.players[0].avatarUnitId, targets: [target] })
    expect(g.prompts.some((p) => p.kind === 'chooseCards')).toBe(false)
    expect(siteNames(g, 'hand')).toEqual([])
    expect(siteNames(g, 'cemetery')).toContain('Spire')
  })

  it('asks which site with several, and refuses an empty pick', () => {
    const { g, target, craterize } = setup(['Spire', 'Stream'])
    act(g, 0, { t: 'castSpell', cardId: craterize, casterId: g.players[0].avatarUnitId, targets: [target] })
    const prompt = g.prompts.find((p) => p.kind === 'chooseCards')!
    expect(prompt).toBeDefined()
    expect(resolvePrompt(g, prompt.id, 0, [])).toBeTruthy()
    expect(resolvePrompt(g, prompt.id, 0, [1])).toBeNull()
    expect(siteNames(g, 'hand')).toEqual(['Spire'])
  })
})
