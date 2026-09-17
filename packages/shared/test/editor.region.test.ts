// Editor bury/submerge/surface (minions + artifacts) via the setRegion judge op. Sending a minion BELOW
// grants the enabling keyword (Burrowing under land, Submerge under water) so a plain minion actually
// survives there instead of being banished by state-based checks. Artifacts sit below freely.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { applyJudge, type GameState, type UnitState } from '../src'

const bone = (g: GameState) => Object.values(g.units).find((v) => v.name === 'Bone Jumble') as UnitState | undefined

describe('editor region change (bury / submerge / surface)', () => {
  it('buries a minion under land (it survives) and surfaces it again', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g as GameState, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x: 1, y: 1 })
    applyJudge(g as GameState, 0, { k: 'summonUnit', name: 'Bone Jumble', player: 0, x: 1, y: 1, region: 'surface', noGenesis: true })
    const id = bone(g as GameState)!.id

    expect(applyJudge(g as GameState, 0, { k: 'setRegion', id, region: 'underground' })).toBeNull()
    expect(g.units[id], 'still on the board (not banished)').toBeTruthy()
    expect(g.units[id]!.region, 'buried').toBe('underground')

    expect(applyJudge(g as GameState, 0, { k: 'setRegion', id, region: 'surface' })).toBeNull()
    expect(g.units[id]!.region, 'surfaced').toBe('surface')
  })

  it('submerges a minion under water terrain (it survives)', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g as GameState, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x: 2, y: 1 })
    const site = Object.values((g as any).sites).find((s: any) => s.x === 2 && s.y === 1) as any
    applyJudge(g as GameState, 0, { k: 'flood', siteId: site.id, on: true }) // make it water terrain
    applyJudge(g as GameState, 0, { k: 'summonUnit', name: 'Bone Jumble', player: 0, x: 2, y: 1, region: 'surface', noGenesis: true })
    const id = bone(g as GameState)!.id
    expect(applyJudge(g as GameState, 0, { k: 'setRegion', id, region: 'underwater' })).toBeNull()
    expect(g.units[id], 'survives underwater').toBeTruthy()
    expect(g.units[id]!.region).toBe('underwater')
  })

  it('buries an artifact in place', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g as GameState, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x: 3, y: 1 })
    applyJudge(g as GameState, 0, { k: 'spawnArtifact', name: 'Onyx Core', player: 0, x: 3, y: 1 })
    const a = Object.values((g as any).artifacts).find((x: any) => x.name === 'Onyx Core') as any
    expect(applyJudge(g as GameState, 0, { k: 'setRegion', id: a.id, region: 'underground' })).toBeNull()
    expect((g as any).artifacts[a.id]?.region, 'artifact buried').toBe('underground')
  })

  it('refuses to bury on a void square (no site) and refuses an avatar', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g as GameState, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x: 0, y: 1 })
    applyJudge(g as GameState, 0, { k: 'summonUnit', name: 'Bone Jumble', player: 0, x: 0, y: 1, region: 'surface', noGenesis: true })
    const u = bone(g as GameState)!
    // move it to a bare (siteless) square first, then try to bury → refused
    u.x = 4; u.y = 2
    expect(applyJudge(g as GameState, 0, { k: 'setRegion', id: u.id, region: 'underground' }), 'no site to bury under').toBeTruthy()
    const avatar = g.players[0].avatarUnitId
    expect(applyJudge(g as GameState, 0, { k: 'setRegion', id: avatar, region: 'underground' }), 'avatars refused').toBeTruthy()
  })
})
