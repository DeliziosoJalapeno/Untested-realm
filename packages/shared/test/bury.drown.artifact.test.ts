// Bury ("Burrow target minion or artifact") and Drown ("Submerge target minion or artifact") must
// be able to target a ground ARTIFACT, not just minions — via the minionOrArtifact target kind.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, waiveThreshold, summonCard, giveArtifact } from './helpers'
import { validateTarget } from '../src'

function groundArtifact(g: any, owner: 0 | 1, name: string, x: number, y: number) {
  const c = `ca${g.nextId++}`; g.cards[c] = { id: c, name, owner }
  const id = `aa${g.nextId++}`
  g.artifacts[id] = { id, cardId: c, name, conjuredBy: owner, x, y, region: 'surface', carriedBy: null, tapped: false }
  return id
}

describe('Bury / Drown can target artifacts', () => {
  it('Bury burrows a ground artifact on a land site', () => {
    const g: any = newGame(); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Active Volcano', 2, 1) // land site
    const art = groundArtifact(g, 1, 'Lance', 2, 1)
    castMagic(g, 0, 'Bury', { targets: [art] })
    expect(g.artifacts[art]?.region, 'the artifact is buried').toBe('underground')
  })

  it('Drown submerges a ground artifact on a water site', () => {
    const g: any = newGame(); keepBoth(g); waiveThreshold(g, 0)
    const site = placeSite(g, 0, 'Active Volcano', 2, 1); (site as any).flooded = true // make it water
    const art = groundArtifact(g, 1, 'Lance', 2, 1)
    castMagic(g, 0, 'Drown', { targets: [art] })
    expect(g.artifacts[art]?.region, 'the artifact is submerged').toBe('underwater')
  })

  it('the artifact is a legal target for the minion-or-artifact spec', () => {
    const g: any = newGame(); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Active Volcano', 2, 1)
    const art = groundArtifact(g, 1, 'Lance', 2, 1)
    const spec = { what: 'minionOrArtifact', count: 1, targeted: true } as any
    const av = g.units[g.players[0].avatarUnitId]
    expect(validateTarget(g, spec, { artifact: art }, av, 0), 'artifact accepted').toBeNull()
  })

  it('burying a CARRIED artifact drags its (non-avatar) bearer underground with it', () => {
    const g: any = newGame(); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Active Volcano', 2, 1) // land
    const bearer = summonCard(g, 1, 'Escyllion Cyclops', 2, 1); bearer.enteredTurn = 0
    bearer.modifiers.push({ kind: 'keyword', keyword: 'burrowing', duration: 'permanent', turn: 0, sourcePlayer: 1 }) // can survive underground
    const art = giveArtifact(g, bearer, 'Lance')
    castMagic(g, 0, 'Bury', { targets: [art.id] })
    expect(g.units[bearer.id]?.region, 'the bearer is dragged under').toBe('underground')
    expect(g.artifacts[art.id]?.region, 'the artifact rides down with it').toBe('underground')
    expect(g.artifacts[art.id]?.carriedBy, 'still carried').toBe(bearer.id)
  })

  it('dragging a NON-burrowing bearer underground buries it alive — it dies (no Burrowing)', () => {
    const g: any = newGame(); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Active Volcano', 2, 1) // land
    const bearer = summonCard(g, 1, 'Escyllion Cyclops', 2, 1); bearer.enteredTurn = 0 // no Burrowing
    const art = giveArtifact(g, bearer, 'Lance')
    castMagic(g, 0, 'Bury', { targets: [art.id] })
    expect(g.units[bearer.id], 'a buried non-burrower does not survive').toBeUndefined()
  })

  it('an AVATAR carrier can not go under — only the artifact is buried (detached)', () => {
    const g: any = newGame(); keepBoth(g); waiveThreshold(g, 0)
    const av = g.units[g.players[1].avatarUnitId]; av.x = 2; av.y = 1
    placeSite(g, 0, 'Active Volcano', 2, 1) // land under the avatar
    const art = giveArtifact(g, av, 'Lance')
    castMagic(g, 0, 'Bury', { targets: [art.id] })
    expect(g.units[av.id]?.region, 'the avatar stays on the surface').toBe('surface')
    expect(g.artifacts[art.id]?.carriedBy, 'the artifact is detached from the avatar').toBeFalsy()
    expect(g.artifacts[art.id]?.region, 'and buried alone').toBe('underground')
  })
})
