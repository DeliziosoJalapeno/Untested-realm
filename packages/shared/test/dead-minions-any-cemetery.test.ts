// Rulebook: "Dead cards are minions that can be found in ANY cemetery." Card text saying "a dead minion"
// (no "your") reaches into EITHER cemetery. Each of these cards used to look only at its controller's own
// cemetery; here each one takes a minion from the OPPONENT's cemetery. A minion brought back enters under
// the reaching player's control but stays owned by its original owner (so it is banished to their pile).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, act, answer, summonCard, giveArtifact, giveMana, castMagic, waiveThreshold } from './helpers'
import { getScript, makeCtx, avatarOf, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

function dead(g: GameState, pid: PlayerId, name: string): string {
  const id = `cdead${g.nextId++}`
  g.cards[id] = { id, name, owner: pid }
  g.players[pid].cemetery.push(id)
  return id
}
const unitOf = (g: GameState, cardId: string) => Object.values(g.units).find((u) => u.cardId === cardId)

describe('"a dead minion" reaches into either cemetery', () => {
  it("Clairvoyant banishes a corpse from the opponent's cemetery into its owner's banished pile", () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 0)
    const seer = summonCard(g, 0, 'Clairvoyant', 2, 0); seer.enteredTurn = -1
    const mine = dead(g, 0, 'Bone Jumble')
    const theirs = dead(g, 1, 'Stygian Archers')
    act(g, 0, { t: 'activate', sourceId: seer.id, ability: 'gaze' })
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    const labels = g.prompts[0].data.cards as string[]
    expect(labels).toEqual(['Bone Jumble (Alice)', 'Stygian Archers (Bob)'])
    answer(g, [1])
    expect(g.players[1].cemetery).not.toContain(theirs)
    expect(g.players[1].banished).toContain(theirs)
    expect(g.players[0].banished).not.toContain(theirs)
    expect(g.players[0].cemetery).toContain(mine)
    expect(g.prompts[0]?.kind).toBe('chooseOption') // the top-spell peek follows
  })

  it("Book of the Dead casts the opponent's dead minion under our control; it is banished to its owner on death", () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 0)
    const book = giveArtifact(g, avatarOf(g, 0), 'Book of the Dead')
    const theirs = dead(g, 1, 'Bone Jumble')
    giveMana(g, 0, 5)
    act(g, 0, { t: 'activate', sourceId: book.id, ability: 'necromancy' })
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    expect(g.prompts[0].data.cards).toEqual(['Bone Jumble (Bob)'])
    answer(g, [0])
    if (g.prompts[0]?.kind === 'chooseSquare') answer(g, { x: 2, y: 0 })
    expect(g.players[1].cemetery).not.toContain(theirs)
    const risen = unitOf(g, theirs)!
    expect(risen).toBeDefined()
    expect(risen.owner).toBe(1)
    expect(risen.controller).toBe(0)
    expect(risen.counters?.bookRisen).toBe(1)
    // "banished if it dies" → into its OWNER's banished pile
    expect(getScript('Book of the Dead')!.onWouldDie!(g, book.id, risen)).toBe(true)
    expect(g.players[1].banished).toContain(theirs)
    expect(g.players[0].banished).not.toContain(theirs)
  })

  it("Corpse Explosion deals a corpse from the opponent's cemetery and banishes it to its owner", () => {
    const g = newGame(); keepBoth(g)
    for (const id of Object.keys(g.sites)) delete g.sites[id]
    placeSite(g, 1, 'Rustic Village', 1, 1)
    const victim = summonCard(g, 1, 'Escyllion Cyclops', 1, 1)
    const corpse = dead(g, 1, 'Stygian Archers') // power 3
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Corpse Explosion')
    answer(g, { x: 1, y: 1 })
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    expect(g.prompts[0].data.cards).toEqual(['Stygian Archers (Bob)'])
    answer(g, [0])
    expect(g.players[1].cemetery).not.toContain(corpse)
    expect(g.players[1].banished).toContain(corpse)
    expect(g.players[0].banished).not.toContain(corpse)
    expect(g.units[victim.id].damage).toBe(3)
  })

  it("Orpheus' Crossing summons the opponent's dead minion here under the site controller's control", () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, "Orpheus' Crossing", 2, 2)
    const theirs = dead(g, 1, 'Bone Jumble')
    getScript("Orpheus' Crossing")!.genesis!(makeCtx(g, site.id, 0, []))
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    expect(g.prompts[0].data.cards).toEqual(['Bone Jumble (Bob)'])
    answer(g, [0])
    expect(g.players[1].cemetery).not.toContain(theirs)
    const risen = unitOf(g, theirs)!
    expect(risen).toBeDefined()
    expect({ x: risen.x, y: risen.y, owner: risen.owner, controller: risen.controller }).toEqual({ x: 2, y: 2, owner: 1, controller: 0 })
  })

  it("Ultimate Horror summons the opponent's dead Voidwalk minion under the Horror controller's control", () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const horror = summonCard(g, 0, 'Ultimate Horror', 2, 2)
    const theirs = dead(g, 1, 'Spectral Stalker')
    getScript('Ultimate Horror')!.genesis!(makeCtx(g, horror.id, 0, []))
    expect(g.prompts[0]?.kind).toBe('chooseSquare')
    expect(g.prompts[0].title).toContain('Spectral Stalker (Bob)')
    answer(g, { x: 2, y: 2 })
    expect(g.players[1].cemetery).not.toContain(theirs)
    const risen = unitOf(g, theirs)!
    expect(risen).toBeDefined()
    expect({ owner: risen.owner, controller: risen.controller, region: risen.region }).toEqual({ owner: 1, controller: 0, region: 'surface' })
  })

  it("Vengeful Heir banishes the opponent's dead Knight (to its owner) and becomes a copy of it", () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const heir = summonCard(g, 0, 'Vengeful Heir', 2, 2)
    const knight = dead(g, 1, 'Blue Knight')
    getScript('Vengeful Heir')!.genesis!(makeCtx(g, heir.id, 0, []))
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    expect(g.prompts[0].data.cards).toEqual(['Blue Knight (Bob)'])
    answer(g, [0])
    expect(g.players[1].cemetery).not.toContain(knight)
    expect(g.players[1].banished).toContain(knight)
    expect(g.players[0].banished).not.toContain(knight)
    expect(g.units[heir.id].name).toBe('Blue Knight')
  })
})
