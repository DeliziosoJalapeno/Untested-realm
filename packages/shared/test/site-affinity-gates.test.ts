// Audit: every affinity-gated site must read TRUE affinity (controlled sites + Elementalist/Cores/
// blooms/judge bonuses), not just the raw symbols printed on your sites. Two previously-broken classes:
//   • Dozmary Pool was entirely ungated.
//   • Molten Maar / Tadpole Pool / Mount Ussar / Kor Crematory / Wormelow Tump re-summed printed
//     site thresholds by hand, silently missing bonus sources. A judge/temp boost that pushes you to
//     the threshold must now count.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { makeCtx, getScript, getCard, type GameState } from '../src'
import '../src/cards/scripts/index'

function waterBonus(g: GameState, player: 0 | 1, water: number) {
  g.flow = g.flow ?? {}
  g.flow.judgeThresh = { ...(g.flow.judgeThresh ?? {}), [player]: { air: 0, earth: 0, fire: 0, water } }
}
function placeSiteRaw(g: GameState, name: string, x: number, y: number) {
  const siteId = `s-${name}-${g.nextId++}`
  g.sites[siteId] = { id: siteId, cardId: `c${g.nextId++}`, name, owner: 0, controller: 0, x, y, tapped: false, isRubble: false } as any
  g.cards[g.sites[siteId].cardId] = { id: g.sites[siteId].cardId, name, owner: 0 } as any
  return siteId
}

describe('Dozmary Pool is gated on (W)(W)(W)', () => {
  it('offers no sink below 3 Water, offers it once the threshold is met via a bonus', () => {
    const own = getCard('Dozmary Pool').thresholds.water // the pool provides its own Water too
    const g = newGame(42, 0) as GameState; keepBoth(g)
    // give the controller an Artifact in hand so the sink *would* be offered if the gate passed
    const artCard = Object.values(g.cards).find((c) => getCard(c.name).type === 'Artifact' && g.players[0].hand.includes(c.id))
    if (!artCard) { g.cards['hx'] = { id: 'hx', name: 'Ring of Morrigan', owner: 0 } as any; g.players[0].hand.push('hx') }

    // below threshold: pool's own water only (own < 3)
    waterBonus(g, 0, 0)
    const sid = placeSiteRaw(g, 'Dozmary Pool', 0, 0)
    getScript('Dozmary Pool')!.genesis!(makeCtx(g, sid, 0, []))
    expect(own < 3 ? g.prompts.length : 1, 'no sink prompt below 3 Water').toBe(own < 3 ? 0 : 1)

    // meet it with a pure bonus (judge threshold) — the old manual re-sum would have ignored this
    const g2 = newGame(42, 0) as GameState; keepBoth(g2)
    g2.cards['hx'] = { id: 'hx', name: 'Ring of Morrigan', owner: 0 } as any; g2.players[0].hand.push('hx')
    waterBonus(g2, 0, 3)
    const sid2 = placeSiteRaw(g2, 'Dozmary Pool', 0, 0)
    getScript('Dozmary Pool')!.genesis!(makeCtx(g2, sid2, 0, []))
    expect(g2.prompts.some((p) => p.kind === 'chooseOption'), 'sink offered once (W)(W)(W) is met by a bonus').toBe(true)
  })
})

describe('Tadpole Pool counts bonus threshold sources (not just printed site symbols)', () => {
  it('a judge/temp Water boost that reaches (W)(W)(W) spawns the three Frogs', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const frogsBefore = Object.values(g.units).filter((u) => u.name === 'Frog').length
    waterBonus(g, 0, 3) // pure bonus — exceeds the gate on its own; the old re-sum would have seen 0 (+pool)
    const sid = placeSiteRaw(g, 'Tadpole Pool', 2, 2)
    getScript('Tadpole Pool')!.genesis!(makeCtx(g, sid, 0, []))
    const frogsAfter = Object.values(g.units).filter((u) => u.name === 'Frog').length
    expect(frogsAfter - frogsBefore, 'three submerged Frogs summoned').toBe(3)
  })

  it('does nothing when neither sites nor bonuses reach 3 Water', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const frogsBefore = Object.values(g.units).filter((u) => u.name === 'Frog').length
    waterBonus(g, 0, 0)
    const sid = placeSiteRaw(g, 'Tadpole Pool', 2, 2) // only the pool's own Water (< 3)
    getScript('Tadpole Pool')!.genesis!(makeCtx(g, sid, 0, []))
    const frogsAfter = Object.values(g.units).filter((u) => u.name === 'Frog').length
    expect(frogsAfter - frogsBefore, 'no Frogs below the threshold').toBe(0)
  })
})
