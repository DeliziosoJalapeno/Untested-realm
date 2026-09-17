// Silver Bullet (and every effect-cast of an artifact: Toolbox / Malleus / Chaoswish copy…) must offer
// the SAME placements as a normal conjure — including HANDING the artifact to your Avatar while it
// stands on an opponent's site (a giveTo unit, not a your-site square). The old effect-cast only
// offered "conjure onto one of YOUR sites", so an Avatar parked on an enemy site could get nothing.
// Also: a PAID collection cast is the real spell, not a "Copy of".
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, answer, giveArtifact } from './helpers'
import { getScript, makeCtx, effectCastSpell, type GameState } from '../src'

describe('effect-cast artifact placement is uniform with a normal conjure', () => {
  it('Silver Bullet lets you give the fetched artifact to your Avatar on an OPPONENT’s site', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 1, 'Rustic Village', 2, 2)               // the site the Avatar stands on is the OPPONENT's
    const mySite = placeSite(g, 0, 'Rustic Village', 3, 3) // I also own a site elsewhere (a conjure option)
    const avatar = g.units[g.players[0].avatarUnitId]
    avatar.x = 2; avatar.y = 2; avatar.region = 'surface'  // parked on the enemy site
    avatar.tapped = false; avatar.enteredTurn = -5
    g.players[0].mana = 5
    g.players[0].collection = { 'Cold Iron Rod': 1 }        // an Exceptional artifact (c1, no threshold)

    const bullet = giveArtifact(g, avatar, 'Silver Bullet')

    getScript('Silver Bullet')!.abilities![0].effect(makeCtx(g, bullet.id, 0, []))
    answer(g, 'Cold Iron Rod') // "the Silver Bullet becomes… Cold Iron Rod"

    // the placement prompt: a mixed unit+site chooseTargets, NOT prefixed "Copy of" (it's a real cast)
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect(String(p!.title)).not.toContain('Copy of')
    expect(p!.data.candidates).toContain(avatar.id) // give it to the Avatar — even on the enemy site
    expect(p!.data.candidates).toContain(mySite.id) // conjure onto my own site is ALSO offered

    answer(g, [avatar.id]) // hand it to the Avatar
    const rod = Object.values(g.artifacts).find((a) => a.name === 'Cold Iron Rod')
    expect(rod, 'Cold Iron Rod was conjured').toBeTruthy()
    expect(rod!.carriedBy).toBe(avatar.id)          // carried by the Avatar…
    expect(rod!.x).toBe(2); expect(rod!.y).toBe(2)  // …which stands on the opponent's site
    expect(avatar.carrying).toContain(rod!.id)
  })

  it('a FREE effect-cast (Chaoswish copy) of an artifact IS labelled "Copy of"', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    effectCastSpell(g, 0, 'Cold Iron Rod', { free: true }) // a free copy
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect(String(p!.title)).toContain('Copy of Cold Iron Rod')
  })
})
