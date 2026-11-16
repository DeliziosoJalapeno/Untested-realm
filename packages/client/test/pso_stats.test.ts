// Play Sorcery Online statistics (the saved snapshot) and the three places the bots use them.
import { describe, it, expect } from 'vitest'
import { psoInfo, psoCard, cardImpact, openingLift, psoMeta, psoSiteOpenings, allCards, unitValue, DEFAULT_WEIGHTS, createGame, applyAction, featuredDecks } from '@sorcery/shared'
import { botAction } from '../src/bot'
import { scene } from '../src/tutorial/scene'
import { deckReference } from '../src/claude_bot'
import { fairView } from '../src/bot_search'

describe('PSO statistics snapshot', () => {
  it('is a real release, keyed by this app\'s card names, with shrunk and bounded figures', () => {
    expect(psoInfo.source).toMatch(/Play Sorcery Online/)
    expect(psoInfo.releasedThrough).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(psoInfo.totalGames).toBeGreaterThan(10000)
    const known = new Set(allCards.map((c) => c.name))
    let n = 0
    for (const c of allCards) {
      const s = psoCard(c.name)
      if (!s) continue
      n++
      expect(known.has(c.name)).toBe(true)
      expect(Math.abs(s.impact), c.name).toBeLessThan(15)
      expect(s.n, c.name).toBeGreaterThanOrEqual(200)
    }
    expect(n).toBeGreaterThan(300)
    expect(cardImpact('No Such Card')).toBe(0)
    expect(openingLift('No Such Card')).toBe(0)
    expect(psoMeta.avatars.length).toBeGreaterThan(10)
    expect(psoSiteOpenings[0].offsets).toHaveLength(2)
  })

  it('scales a minion\'s worth by its measured impact, within ±30%', () => {
    const names = allCards.filter((c) => c.type === 'Minion' && psoCard(c.name)).map((c) => c.name)
    const best = names.reduce((a, b) => (cardImpact(a) >= cardImpact(b) ? a : b))
    const t = scene({ sites: [[0, 'Valley', 2, 0], [1, 'Wasteland', 2, 3]], units: [{ key: 'u', p: 0, name: best, x: 2, y: 0 }] })
    const u = t.g.units[t.ids.u]
    const base = unitValue(t.g, u, { ...DEFAULT_WEIGHTS, cardImpact: 0 })
    const with_ = unitValue(t.g, u, { ...DEFAULT_WEIGHTS, cardImpact: 0.04 })
    expect(cardImpact(best)).toBeGreaterThan(2)
    expect(with_).toBeGreaterThan(base)
    expect(with_).toBeLessThanOrEqual(base * 1.3 + 1e-9)
    expect(unitValue(t.g, u, { ...DEFAULT_WEIGHTS, cardImpact: 10 })).toBeCloseTo(base * 1.3, 6) // clamped
  })

  it('sends back cards that lose games in the opening hand, and only those', () => {
    const weak = allCards.filter((c) => openingLift(c.name) <= -1.4).map((c) => c.name)
    expect(weak.length).toBeGreaterThan(3)
    let sentWeak = 0, sentOther = 0, hands = 0
    for (let i = 0; i < 120; i++) {
      const g = createGame([featuredDecks[i % featuredDecks.length], featuredDecks[(i + 1) % featuredDecks.length]], ['A', 'B'], 300 + i, 0)
      for (let k = 0; k < 6 && g.prompts.length; k++) if (!applyAction(g, g.prompts[0].player, botAction(g, g.prompts[0].player)).ok) break
      if (g.phase !== 'mulligan') continue
      hands++
      const sites = g.players[0].hand.filter((id) => allCards.find((c) => c.name === g.cards[id].name)?.type === 'Site').length
      const a = botAction(g, 0)
      if (a.t !== 'mulligan') continue
      expect(a.back.length).toBeLessThanOrEqual(3)
      for (const id of a.back) {
        const name = g.cards[id].name
        if (weak.includes(name)) sentWeak++
        else { sentOther++; expect(sites === 0 || (allCards.find((c) => c.name === name)!.cost ?? 0) >= 6, name).toBe(true) } // the older rules
      }
    }
    expect(hands).toBeGreaterThan(50)
    expect(sentWeak).toBeGreaterThan(0)
  })

  it('shows Claude the measured impact of a card that has one', () => {
    const strong = allCards.find((c) => c.type === 'Minion' && cardImpact(c.name) >= 2.5)!.name
    const t = scene({ sites: [[0, 'Valley', 2, 0], [1, 'Wasteland', 2, 3]], hand: [strong, 'Foot Soldiers'] })
    const ref = deckReference(fairView(t.g, 0), 0)
    const line = (name: string) => ref.split('\n').find((l) => l.startsWith(`${name} — `))!
    expect(line(strong)).toMatch(/\[impact \+\d/)
    expect(line('Foot Soldiers')).not.toMatch(/impact/)
  })
})
