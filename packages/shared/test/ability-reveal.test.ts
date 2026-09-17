// Activated abilities animate like a spell cast (flow.areaReveal, synced to both seats): a golden
// caster, a site glow, and a writing. Base caption is "<card>'s ability"; projectile abilities read
// "<card> shoots!"; the avatar's site actions read "<avatar> plays <site>" / "<avatar> draws a site".
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, placeSite } from './helpers'
import { avatarOf, legalSiteSquares, type GameState, type PlayerId } from '../src'

function mkWorm(g: any, x: number, y: number): void {
  g.cards['cw'] = { id: 'cw', name: 'Conqueror Worm', owner: 0 }
  g.units['cw'] = { id: 'cw', cardId: 'cw', name: 'Conqueror Worm', owner: 0, controller: 0, isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: -5, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} }
}

function mkUnit(g: any, id: string, name: string, owner: PlayerId, x: number, y: number, mods: any[] = []): void {
  g.cards[id] = { id, name, owner }
  g.units[id] = { id, cardId: id, name, owner, controller: owner, isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: -5, modifiers: mods, carrying: [], carryingUnits: [], usedThisTurn: {} }
}

describe('activated-ability reveal', () => {
  it('a plain ability (Field Laborers: Tap → Gain ②) → "<card>\'s ability" over its own glowing site', () => {
    const g: any = newGame(); keepBoth(g)
    mkUnit(g, 'fl', 'Field Laborers', 0, 2, 2)
    act(g, 0, { t: 'activate', sourceId: 'fl', ability: 'toil' })
    const rev = g.flow.areaReveal
    expect(rev.name).toBe("Field Laborers's ability")
    expect(rev.ability, 'flagged as an ability reveal').toBe(true)
    expect(rev.shoots, 'not a projectile').toBe(false)
    expect(rev.casterId).toBe('fl')
    expect(rev.redSites, 'the caster site lights up').toContainEqual({ x: 2, y: 2 })
    expect(rev.seq).toBeGreaterThan(0)
  })

  it('a built-in Ranged shot → "<card> shoots!" (golden shooter + its site)', () => {
    const g: any = newGame(); keepBoth(g)
    mkUnit(g, 'sh', 'Field Laborers', 0, 1, 1, [{ kind: 'keyword', keyword: 'ranged' }])
    mkUnit(g, 'en', 'Field Laborers', 1, 1, 2) // enemy one step north, in range
    act(g, 0, { t: 'activate', sourceId: 'sh', ability: 'ranged', extra: { direction: 'n' } })
    const rev = g.flow.areaReveal
    expect(rev.name).toBe('Field Laborers shoots!')
    expect(rev.ability).toBe(true)
    expect(rev.shoots, 'projectile flag set').toBe(true)
    expect(rev.casterId).toBe('sh')
    expect(rev.redSites, 'the shooter site lights up').toContainEqual({ x: 1, y: 1 })
  })

  it('the avatar drawing a site → "<avatar> draws a site"', () => {
    const g: any = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; av.tapped = false
    // seed the atlas so the draw succeeds
    const sid = 'atlasS'; g.cards[sid] = { id: sid, name: 'Rustic Village', owner: 0 }; g.players[0].atlas.push(sid)
    act(g, 0, { t: 'avatarSite', mode: 'draw' })
    const rev = g.flow.areaReveal
    expect(rev.name).toBe(`${av.name} draws a site`)
    expect(rev.ability).toBe(true)
    expect(rev.casterId).toBe(av.id)
    expect(rev.redSites, 'the avatar site lights up').toContainEqual({ x: 2, y: 2 })
  })

  it('the avatar playing a site → "<avatar> plays <site>" over the played square', () => {
    const g: any = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; av.tapped = false
    const cid = 'handSite'; g.cards[cid] = { id: cid, name: 'Rustic Village', owner: 0 }; g.players[0].hand.push(cid)
    const sq = legalSiteSquares(g as GameState, 0, 'Rustic Village')[0]
    expect(sq, 'there is a legal square to play a site').toBeTruthy()
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: cid, x: sq.x, y: sq.y })
    const rev = g.flow.areaReveal
    expect(rev.name).toBe(`${av.name} plays Rustic Village`)
    expect(rev.ability).toBe(true)
    expect(rev.casterId).toBe(av.id)
    expect(rev.redSites, 'the played site glows').toContainEqual({ x: sq.x, y: sq.y })
  })

  it('an END-OF-TURN trigger that DID something (Conqueror Worm claims a site) animates', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 1, 'Rustic Village', 2, 2) // an ENEMY site the Worm can claim → it acts
    mkWorm(g, 2, 2)
    act(g, 0, { t: 'endTurn' })
    const rev = g.flow.areaReveal
    expect(rev?.name).toBe("Conqueror Worm's ability")
    expect(rev?.ability).toBe(true)
    expect(rev?.casterId).toBe('cw')
    expect(rev?.redSites, 'the claimed site glows').toContainEqual({ x: 2, y: 2 })
  })

  it('an END-OF-TURN trigger that did NOTHING (Worm already owns its site) does NOT animate', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2) // MY site already → the Worm's trigger is a no-op
    mkWorm(g, 2, 2)
    act(g, 0, { t: 'endTurn' })
    expect(g.flow.areaReveal, 'no reveal for an idle end-of-turn trigger').toBeFalsy()
  })
})
