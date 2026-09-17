// "Empty means empty" — a site is EMPTY only if nothing occupies it: no units in ANY region
// (incl. avatars and a face-down/blanked flipped card, which still occupies its square per the FAQ),
// no ground artifact, and no aura. Edge/wall auras sit on the border, not on a site, so they don't count.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { isSiteEmpty, getScript, isBlanked, makeCtx, avatarOf, type GameState, type Region } from '../src'
import '../src/cards/scripts/index'

function putArtifact(g: GameState, name: string, x: number, y: number, region: Region = 'surface', carriedBy: string | null = null): string {
  const cardId = `ca${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: 0 }
  const id = `a${g.nextId++}`
  ;(g.artifacts as any)[id] = { id, cardId, name, conjuredBy: 0, x, y, region, carriedBy, tapped: false }
  return id
}
function putAura(g: GameState, name: string, squares: { x: number; y: number }[], edge?: any): string {
  const cardId = `cr${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: 0 }
  const id = `r${g.nextId++}`
  ;(g.auras as any)[id] = { id, cardId, name, controller: 0, squares, ...(edge ? { edge } : {}), enteredTurn: 0 }
  return id
}

describe('isSiteEmpty — what counts as occupying a site', () => {
  it('an untouched site is empty', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    expect(isSiteEmpty(g, 2, 2)).toBe(true)
  })

  for (const region of ['surface', 'underground', 'underwater'] as Region[]) {
    it(`a ${region} unit makes it non-empty`, () => {
      const g = newGame() as GameState; keepBoth(g)
      placeSite(g, 0, 'Rustic Village', 2, 2)
      summonCard(g, 0, 'Bone Jumble', 2, 2, region)
      expect(isSiteEmpty(g, 2, 2), `a ${region} unit occupies the site`).toBe(false)
    })
  }

  it('an avatar standing on it makes it non-empty', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; av.region = 'surface'
    expect(isSiteEmpty(g, 2, 2)).toBe(false)
  })

  it('a FACE-DOWN (blanked flipped) card makes it non-empty — it still occupies its square', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    // a Vivien flipped to a side she lacks: blanked, no longer a minion — but still on the board
    const ghost = summonCard(g, 0, 'Vivien the Enchantress', 2, 2); ghost.flipped = true
    expect(isBlanked(ghost), 'the flipped Vivien is a blanked, face-down card').toBe(true)
    expect(isSiteEmpty(g, 2, 2), 'a face-down card is NOT nothing — the site is occupied').toBe(false)
  })

  it('a ground artifact makes it non-empty; a carried one does not (its carrier already does)', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    putArtifact(g, 'Meat Hook', 2, 2)
    expect(isSiteEmpty(g, 2, 2), 'a ground artifact occupies the site').toBe(false)

    const g2 = newGame() as GameState; keepBoth(g2)
    placeSite(g2, 0, 'Rustic Village', 2, 2)
    putArtifact(g2, 'Meat Hook', 2, 2, 'surface', 'someCarrier')
    expect(isSiteEmpty(g2, 2, 2), 'a CARRIED artifact does not, on its own, occupy the site').toBe(true)
  })

  it('an aura covering it makes it non-empty; an edge/wall aura on the border does not', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    putAura(g, 'Wildfire', [{ x: 2, y: 2 }])
    expect(isSiteEmpty(g, 2, 2), 'an area aura sits on the site').toBe(false)

    const g2 = newGame() as GameState; keepBoth(g2)
    placeSite(g2, 0, 'Rustic Village', 2, 2)
    putAura(g2, 'Wall of Fire', [{ x: 2, y: 2 }], { a: { x: 2, y: 2 }, b: { x: 3, y: 2 } })
    expect(isSiteEmpty(g2, 2, 2), 'a wall sits on the border between squares, not on the site').toBe(true)
  })
})

describe('Pristine Paradise — provides only while completely empty', () => {
  const provides = (g: GameState, siteId: string) => getScript('Pristine Paradise')!.siteProvides!(g, g.sites[siteId])

  it('provides when empty, and stops for a unit, artifact, aura or face-down card', () => {
    const g = newGame() as GameState; keepBoth(g)
    const site = placeSite(g, 0, 'Pristine Paradise', 2, 2)
    expect(provides(g, site.id), 'empty → provides').toBe(true)

    const aura = putAura(g, 'Wildfire', [{ x: 2, y: 2 }])
    expect(provides(g, site.id), 'an aura alone stops it').toBe(false)
    delete (g.auras as any)[aura]

    const art = putArtifact(g, 'Meat Hook', 2, 2)
    expect(provides(g, site.id), 'a ground artifact alone stops it').toBe(false)
    delete (g.artifacts as any)[art]

    const ghost = summonCard(g, 0, 'Vivien the Enchantress', 2, 2); ghost.flipped = true
    expect(provides(g, site.id), 'even a face-down card stops it').toBe(false)
  })
})

describe("Baba Yaga's Hut — only swaps with a truly empty back-row site", () => {
  it('excludes back-row sites that hold a unit, artifact or aura', () => {
    const g = newGame(1, 0) as GameState; keepBoth(g)
    // keep both avatars out of the back row so they don't occupy a candidate square
    const a0 = avatarOf(g, 0); a0.x = 2; a0.y = 2
    const a1 = avatarOf(g, 1); a1.x = 2; a1.y = 2
    const hut = placeSite(g, 0, "Baba Yaga's Hut", 2, 0) // back row for player 0 is y=0
    placeSite(g, 0, 'Rustic Village', 0, 0) // empty → valid
    placeSite(g, 0, 'Rustic Village', 1, 0); putArtifact(g, 'Meat Hook', 1, 0) // artifact → invalid
    placeSite(g, 0, 'Rustic Village', 3, 0); putAura(g, 'Wildfire', [{ x: 3, y: 0 }]) // aura → invalid
    placeSite(g, 0, 'Rustic Village', 4, 0); summonCard(g, 0, 'Bone Jumble', 4, 0) // unit → invalid

    getScript("Baba Yaga's Hut")!.abilities![0].effect(makeCtx(g, hut.id, 0, []))
    const prompt = g.prompts[0]
    expect(prompt, 'the hut offers a swap target').toBeTruthy()
    const offered = (prompt.data as any).squares.map((s: any) => `${s.x},${s.y}`).sort()
    expect(offered, 'only the genuinely empty back-row site is offered').toEqual(['0,0'])
  })
})
