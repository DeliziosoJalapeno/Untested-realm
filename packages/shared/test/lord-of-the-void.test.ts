// Lord of the Void banishes an adjacent site. The square becomes an empty void, so EVERYTHING that
// stood on it (any region) falls into the void: non-voidwalkers are banished (rulebook), voidwalkers
// survive there. No unit may be left on the phantom "surface" of a void. The "may banish" prompt is
// optional (skippable via Esc / a null answer).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact } from './helpers'
import { makeCtx, getScript, effKeywords, type GameState } from '../src'

const unmake = (g: GameState, lordId: string, sq: { x: number; y: number } | null) =>
  getScript('Lord of the Void')!.conts!.unmake(makeCtx(g, lordId, 0, []), {}, sq)

describe('Lord of the Void unmakes a site into the void', () => {
  it('banishes non-voidwalkers, leaves voidwalkers alive in the void, never a surfaced void', () => {
    const g = newGame(); keepBoth(g)
    const lord = summonCard(g, 0, 'Lord of the Void', 2, 2); lord.enteredTurn = -1
    placeSite(g, 0, 'Hamlet', 2, 1) // orthogonally adjacent site
    const mortal = summonCard(g, 1, 'Foot Soldier', 2, 1); mortal.enteredTurn = -1
    const ghost = summonCard(g, 1, 'Foot Soldier', 2, 1); ghost.enteredTurn = -1
    ghost.modifiers.push({ kind: 'keyword', keyword: 'voidwalk', duration: 'permanent', turn: g.turn } as any)
    expect(effKeywords(g, ghost).voidwalk).toBe(true)
    // a loose GROUND artifact standing on the doomed site, plus one CARRIED by the surviving voidwalker
    const acid = `ctest${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Poisonous Dagger', owner: 1 }
    const aid = `atest${g.nextId++}`
    g.artifacts[aid] = { id: aid, cardId: acid, name: 'Poisonous Dagger', conjuredBy: 1, x: 2, y: 1, region: 'surface', carriedBy: null, tapped: false } as any
    const carried = giveArtifact(g, ghost, 'Poisonous Dagger')

    unmake(g, lord.id, { x: 2, y: 1 })

    expect(Object.values(g.sites).some((s) => s.x === 2 && s.y === 1 && !s.isRubble), 'the site is gone — a void').toBe(false)
    expect(g.units[mortal.id], 'non-voidwalker is banished by the void (not killed to cemetery)').toBeUndefined()
    expect(g.units[ghost.id], 'voidwalker survives').toBeTruthy()
    expect(g.units[ghost.id].region, 'and is now in the void region').toBe('void')
    expect(Object.values(g.units).some((u) => u.x === 2 && u.y === 1 && u.region === 'surface' && !u.isAvatar),
      'nothing lingers on the phantom surface of the void').toBe(false)
    // artifacts fall into the void too (user ask): the loose one directly, the carried one rides its voidwalker
    expect(g.artifacts[aid]?.region, 'loose ground artifact sinks into the void').toBe('void')
    expect(g.artifacts[carried.id]?.region, 'artifact carried by the surviving voidwalker is in the void with it').toBe('void')
  })

  it('a burrowed non-voidwalker on the site also falls into the void (not left underground)', () => {
    const g = newGame(); keepBoth(g)
    const lord = summonCard(g, 0, 'Lord of the Void', 2, 2); lord.enteredTurn = -1
    placeSite(g, 0, 'Hamlet', 2, 1)
    const digger = summonCard(g, 1, 'Foot Soldier', 2, 1, 'underground'); digger.enteredTurn = -1

    unmake(g, lord.id, { x: 2, y: 1 })
    expect(g.units[digger.id], 'burrowed non-voidwalker banished by the void').toBeUndefined()
  })

  it('declining (null / skip) leaves the site untouched', () => {
    const g = newGame(); keepBoth(g)
    const lord = summonCard(g, 0, 'Lord of the Void', 2, 2); lord.enteredTurn = -1
    const site = placeSite(g, 0, 'Hamlet', 2, 1)

    unmake(g, lord.id, null)
    expect(g.sites[site.id], 'site still standing after a skip').toBeTruthy()
  })

  it('the "may banish" prompt is flagged optional (so the client can offer Esc/skip)', () => {
    const g = newGame(); keepBoth(g)
    const lord = summonCard(g, 0, 'Lord of the Void', 2, 2); lord.enteredTurn = -1
    placeSite(g, 0, 'Hamlet', 2, 1)

    getScript('Lord of the Void')!.endOfTurn!(makeCtx(g, lord.id, 0, []))
    const pr = g.prompts[0] as any
    expect(pr?.kind).toBe('chooseSquare')
    expect(pr.data.optional, 'optional → skippable').toBe(true)
  })

  it('"adjacent" includes his OWN square — he may banish the site he stands on, and survives in the void', () => {
    const g = newGame(); keepBoth(g)
    const own = placeSite(g, 0, 'Hamlet', 2, 2)
    const lord = summonCard(g, 0, 'Lord of the Void', 2, 2); lord.enteredTurn = -1
    expect(effKeywords(g, lord).voidwalk, 'Lord of the Void has Voidwalk').toBe(true)

    // his own square is an offered candidate (rulebook: adjacent includes own square)
    getScript('Lord of the Void')!.endOfTurn!(makeCtx(g, lord.id, 0, []))
    const pr = g.prompts[0] as any
    expect(pr.data.squares.some((s: any) => s.x === 2 && s.y === 2), 'own square is targetable').toBe(true)

    // banish the site under himself → he falls into the void and, being a Voidwalker, survives there
    unmake(g, lord.id, { x: 2, y: 2 })
    expect(g.sites[own.id], 'his site is gone').toBeFalsy()
    expect(g.units[lord.id], 'the Lord himself survives').toBeTruthy()
    expect(g.units[lord.id].region, 'now standing in the void he made').toBe('void')
  })
})
