// Waveshaper FAQ compliance tests
//   FAQ1: re-picking the same site keeps it continuously flooded (no moment when unflooded)
//   FAQ2: minions without submerge tap even if the site is Bedrock (flood fails there)
//   FAQ3: the same site can be re-selected as long as it is nearby a body of water
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { makeCtx, getScript } from '../src'

function waveshaperCtx(g: any, player: 0 | 1 = 0) {
  return makeCtx(g, g.players[player].avatarUnitId, player, [])
}

describe('Waveshaper FAQ', () => {
  it('FAQ3: already-flooded site kept by Waveshaper appears in candidate list', () => {
    const g: any = newGame(); keepBoth(g)
    // Water site at (2,1) acts as the body of water — the AVATAR must stand in it ("your body of water")
    const water = placeSite(g, 0, 'Pond', 2, 1)
    const av = g.units[g.players[0].avatarUnitId]; av.x = 2; av.y = 1
    // A site adjacent to the water site at (2,2)
    const target = placeSite(g, 0, 'Hamlet', 2, 2)
    // Mark this site as already kept-flooded by Waveshaper for player 0
    target.flooded = true
    g.flow = g.flow ?? {}
    g.flow.waveshaperFlood = { 0: target.id }

    const ctx = waveshaperCtx(g)
    const ability = getScript('Waveshaper')!.abilities![0]
    // Capture the squares passed to ctx.ask
    let captured: { x: number; y: number }[] = []
    const originalAsk = ctx.ask.bind(ctx)
    ;(ctx as any).ask = (prompt: any, _key: string, _extra?: any) => {
      captured = prompt.data?.squares ?? []
    }
    ability.effect(ctx)

    expect(captured.some((sq: any) => sq.x === target.x && sq.y === target.y),
      'already-flooded Waveshaper site must be re-selectable (FAQ3)').toBe(true)
  })

  it('FAQ3: currently-kept site not filtered even though flooded=true', () => {
    const g: any = newGame(); keepBoth(g)
    // Use in-bounds coordinates: grid is 5 wide x 4 tall (y 0-3)
    const water = placeSite(g, 0, 'Pond', 3, 1)
    const av = g.units[g.players[0].avatarUnitId]; av.x = 3; av.y = 1 // avatar stands in the body of water
    const kept = placeSite(g, 0, 'Hamlet', 3, 2)
    kept.flooded = true
    g.flow = { waveshaperFlood: { 0: kept.id } }

    const ctx = waveshaperCtx(g)
    let squares: { x: number; y: number }[] = []
    ;(ctx as any).ask = (prompt: any) => { squares = prompt.data?.squares ?? [] }
    getScript('Waveshaper')!.abilities![0].effect(ctx)

    expect(squares.some((sq: any) => sq.x === kept.x && sq.y === kept.y)).toBe(true)
  })

  it('FAQ1+FAQ3: re-selecting the same site in the cont keeps it flooded', () => {
    const g: any = newGame(); keepBoth(g)
    const water = placeSite(g, 0, 'Pond', 2, 1)
    const target = placeSite(g, 0, 'Hamlet', 2, 2)
    target.flooded = true
    g.flow = { waveshaperFlood: { 0: target.id } }

    const ctx = waveshaperCtx(g)
    // Run the continuation as if the player chose the same site again
    getScript('Waveshaper')!.conts!.wave(ctx, {}, { x: target.x, y: target.y })

    // The site is still tracked as the current flood
    expect(g.flow.waveshaperFlood[0]).toBe(target.id)
    // The site should still be flooded (floodSite keeps it flooded)
    expect(g.sites[target.id].flooded).toBe(true)
  })

  it('FAQ3: a site flooded by another source near your waters IS still a target (to tap minions there)', () => {
    const g: any = newGame(); keepBoth(g)
    const water = placeSite(g, 0, 'Pond', 2, 1)
    const av = g.units[g.players[0].avatarUnitId]; av.x = 2; av.y = 1 // avatar stands in the body of water
    const target = placeSite(g, 0, 'Hamlet', 2, 2)
    // Flooded by some OTHER means, not by this Waveshaper
    target.flooded = true
    g.flow = { waveshaperFlood: { 0: 'some-other-site-id' } }

    const ctx = waveshaperCtx(g)
    let squares: { x: number; y: number }[] = []
    ;(ctx as any).ask = (prompt: any) => { squares = prompt.data?.squares ?? [] }
    getScript('Waveshaper')!.abilities![0].effect(ctx)

    // ANY nearby site may be chosen now — even one already flooded by another source — to wash over
    // (and tap) the non-submerge minions standing on it (per the FAQ).
    expect(squares.some((sq: any) => sq.x === target.x && sq.y === target.y)).toBe(true)
  })
})
