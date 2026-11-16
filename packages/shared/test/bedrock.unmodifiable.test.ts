// Owner ruling (2026-11-14): "can't be modified" means a site can't be disabled, silenced, flooded,
// immobilized or transformed — so Atlantean Fate, The Flood, Drought and the rest leave Bedrock alone.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, answer } from './helpers'
import { makeCtx, getScript, siteSilenced, siteDisabled, affinity, terrainAt, siteFlooded, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

const me: PlayerId = 0
const foe: PlayerId = 1

function aura(g: GameState, name: string, squares: { x: number; y: number }[], genesis = true) {
  const id = `au${g.nextId++}`
  g.cards[`${id}c`] = { id: `${id}c`, name, owner: foe } as any
  g.auras[id] = { id, cardId: `${id}c`, name, controller: foe, squares } as any
  if (genesis) getScript(name)?.genesis?.(makeCtx(g, id, foe, []))
}

describe("Bedrock can't be modified", () => {
  it('Atlantean Fate: not flooded, not silenced, not a water site, and it still provides its own earth', () => {
    const g: GameState = newGame(); keepBoth(g)
    const bedrock = placeSite(g, me, 'Bedrock', 2, 1)
    const earth0 = affinity(g, me).earth
    aura(g, 'Atlantean Fate', [{ x: 2, y: 1 }])
    expect(siteFlooded(g, bedrock)).toBe(false)
    expect(siteSilenced(g, bedrock)).toBe(false)
    expect(terrainAt(g, 2, 1)).toBe('land')
    expect(affinity(g, me).earth, 'not limited to water threshold').toBe(earth0)
  })

  it('The Flood floods the realm but not Bedrock', () => {
    const g: GameState = newGame(); keepBoth(g)
    const bedrock = placeSite(g, me, 'Bedrock', 2, 1)
    const village = placeSite(g, me, 'Rustic Village', 3, 1)
    g.cards['fl'] = { id: 'fl', name: 'The Flood', owner: foe } as any
    getScript('The Flood')!.onCast!(makeCtx(g, 'fl', foe, []))
    while (g.prompts.length) answer(g, [(g.prompts[0] as any).data?.candidates?.[0]])
    expect(siteFlooded(g, bedrock)).toBe(false)
    expect(siteFlooded(g, village)).toBe(true)
  })

  it('a flood written straight onto it is still ignored', () => {
    const g: GameState = newGame(); keepBoth(g)
    const bedrock = placeSite(g, me, 'Bedrock', 2, 1)
    bedrock.flooded = true
    expect(siteFlooded(g, bedrock)).toBe(false)
    expect(terrainAt(g, 2, 1)).toBe('land')
  })

  it('Blightstone carried onto it does not disable it', () => {
    const g: GameState = newGame(); keepBoth(g)
    const bedrock = placeSite(g, me, 'Bedrock', 2, 1)
    const bearer = summonCard(g, foe, 'Escyllion Cyclops', 2, 1)
    giveArtifact(g, bearer, 'Blightstone')
    expect(siteDisabled(g, bedrock)).toBe(false)
  })

  it('Desecrate cannot transform it', () => {
    const g: GameState = newGame(); keepBoth(g)
    const bedrock = placeSite(g, me, 'Bedrock', 2, 1)
    const ally = summonCard(g, me, 'Escyllion Cyclops', 2, 1)
    g.cards['ds'] = { id: 'ds', name: 'Desecrate', owner: me } as any
    getScript('Desecrate')!.onCast!(makeCtx(g, 'ds', me, [{ unit: ally.id }]))
    expect(g.prompts.some((p) => /Transform/.test(p.title ?? '')), 'no transform offered').toBe(false)
    expect(g.sites[bedrock.id].name).toBe('Bedrock')
  })
})
