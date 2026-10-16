// Waveshaper: "Tap → Flood a site near your body of water…" Two fixes:
//  1) "your body of water" (FAQ) = the body of water your AVATAR occupies, a connected region of water
//     sites that is CONTROLLER-INDEPENDENT — an opponent's water site in the same body still extends it.
//     (Was: only sites YOU control, so an enemy water tile in your lake was ignored.)
//  2) ANY nearby site may be chosen — dry OR already flooded (even flooded by another source) — since the
//     point is to tap the non-submerge minions there. (Was: already-flooded sites were excluded.)
import { describe, it, expect } from 'vitest'
import { createGame, starterDecks, avatarOf, type GameState, type PlayerId } from '../src'
import { makeCtx } from '../src/engine/effects'
import { getScript } from '../src/cards/scripts/registry'
import '../src/cards/scripts/index'

function waveGame(): GameState {
  const d0: any = { ...starterDecks[0], avatar: 'Waveshaper' }
  const g: any = createGame([d0, starterDecks[1] as any], ['W', 'F'], 42, 0)
  g.phase = 'main'; g.activePlayer = 0; g.prompts = []
  for (const k of Object.keys(g.sites)) delete g.sites[k]
  return g
}
function site(g: GameState, p: PlayerId, name: string, x: number, y: number, flooded = false): void {
  const cid = `cS${g.nextId++}`; (g as any).cards[cid] = { id: cid, name, owner: p }
  const sid = `sS${g.nextId++}`
  ;(g as any).sites[sid] = { id: sid, cardId: cid, name, owner: p, controller: p, x, y, tapped: false, isRubble: false, flooded: flooded || undefined }
}
function floodCandidates(g: GameState): { x: number; y: number }[] {
  const av = avatarOf(g, 0)
  const ctx = makeCtx(g, av.id, 0, [])
  getScript('Waveshaper')!.abilities![0].effect(ctx)
  return ((g.prompts[0]?.data as any)?.squares ?? []) as { x: number; y: number }[]
}
const has = (sqs: { x: number; y: number }[], x: number, y: number) => sqs.some((s) => s.x === x && s.y === y)

describe('Waveshaper body of water', () => {
  it('an OPPONENT’s water site in the same body extends it (controller-independent)', () => {
    const g = waveGame()
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    site(g, 0, 'Babbling Brook', 2, 2) // avatar's own water tile
    site(g, 1, 'Babbling Brook', 2, 1) // OPPONENT's water tile, connected → part of the body
    site(g, 0, 'Rustic Village', 2, 0) // a land site reachable ONLY via the enemy water tile
    const sqs = floodCandidates(g)
    expect(has(sqs, 2, 0), 'a site near the body THROUGH the enemy water tile is floodable now').toBe(true)
  })

  it('an already-flooded nearby site is still a valid target (to tap minions there)', () => {
    const g = waveGame()
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    site(g, 0, 'Babbling Brook', 2, 2)
    site(g, 0, 'Rustic Village', 2, 1, true) // already flagged flooded
    const sqs = floodCandidates(g)
    expect(has(sqs, 2, 1), 'the already-flooded site is offered').toBe(true)
  })

  it('does nothing if the Avatar is not in a body of water (fish out of water)', () => {
    const g = waveGame()
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    site(g, 0, 'Rustic Village', 2, 2) // land — avatar is NOT in water
    site(g, 0, 'Babbling Brook', 0, 0) // a water site you control, but not where the avatar stands
    const sqs = floodCandidates(g)
    expect(sqs.length, 'no flood prompt — the Waveshaper is beached').toBe(0)
  })
})
