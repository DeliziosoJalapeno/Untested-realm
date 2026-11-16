// Archimago echoing Lightning Bolt while carrying Ring of Morrigan: the Ring's "whenever this unit casts a
// spell" prompt PARKS the copy's resolution (flow.pendingCast). The copy token used to be removed as soon as
// castSpell returned, so the parked bolt resolved as nothing ("casts Lightning Bolt", then no damage).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, answer, giveMana, waiveThreshold, summonCard, giveArtifact, fillSites } from './helpers'
import { avatarOf, type GameState, type PlayerId } from '../src'

function toCemetery(g: GameState, player: PlayerId, name: string): string {
  const id = `cm${g.nextId++}`
  ;(g.cards as any)[id] = { id, name, owner: player }
  g.players[player].cemetery.push(id)
  return id
}

function echoBolt(bleed: boolean) {
  const g = newGame(); keepBoth(g); fillSites(g) // the bolt's target location must be a surface
  const avatar = avatarOf(g, 0); avatar.name = 'Archimago'
  giveArtifact(g, avatar, 'Ring of Morrigan')
  const foe = summonCard(g, 1, 'Stygian Archers', avatar.x, avatar.y + 1) // 3/3, nearby the bearer
  for (let i = 0; i < 3; i++) toCemetery(g, 0, 'Lightning Bolt')
  giveMana(g, 0, 20); waiveThreshold(g, 0)
  act(g, 0, { t: 'activate', sourceId: avatar.id, ability: 'echo' })
  answer(g, [0]); answer(g, [0, 1])
  answer(g, { x: foe.x, y: foe.y })                      // the copy's target location
  expect(String(g.prompts[0]?.title)).toMatch(/Ring of Morrigan/)
  answer(g, bleed ? [foe.id] : [])                       // the Ring's cast trigger
  return { g, foe }
}

describe('Archimago echo behind a cast-trigger prompt (Ring of Morrigan)', () => {
  it('the parked copy still resolves when the Ring is skipped', () => {
    const { g, foe } = echoBolt(false)
    expect(g.log.some((l) => /Stygian Archers takes 3 damage/.test(l.msg)), 'the bolt dealt its 3').toBe(true)
    expect(g.units[foe.id], 'the 3/3 died').toBeUndefined()
    expect(g.prompts.length).toBe(0)
  })

  it('the parked copy still resolves after the Ring bleeds, and the copy vanishes', () => {
    const { g, foe } = echoBolt(true)
    expect(g.units[foe.id], '1 (Ring) + 3 (bolt) killed the 3/3').toBeUndefined()
    expect(g.players[0].cemetery.length, 'the copy never lands in the cemetery').toBe(0)
    expect(g.players[0].banished.length, 'only the three cost cards are banished').toBe(3)
    expect(g.flow?.pendingCast, 'nothing left parked').toBeFalsy()
  })
})
