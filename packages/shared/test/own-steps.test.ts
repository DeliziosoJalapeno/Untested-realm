// "Take a step" is the unit's OWN step (Codex, Step, definition 2): it "may use abilities like Airborne,
// Voidwalk, Burrow, and Submerge, crossing region boundaries", an Immobile unit can't take it, and it is a
// real walk (resolveMovement: walls, "enters here" triggers, the move animation), not a hand-set position
// or a teleport. "Closest" counts the unit's own steps (Codex, Closest / Range of Motion).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, summonCard, castMagic, answer, act, actFail, placeSite, waiveThreshold } from './helpers'
import { avatarOf, getScript, isLegalStep, makeCtx, type GameState, type KeywordGrant, type UnitState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame(); keepBoth(g); fillSites(g); waiveThreshold(g, 0)
  return g
}
const at = (u: UnitState | undefined) => (u ? `${u.x},${u.y}` : 'gone')
const grant = (g: GameState, u: UnitState, keyword: KeywordGrant) =>
  u.modifiers.push({ kind: 'keyword', keyword, duration: 'permanent', turn: g.turn, sourcePlayer: u.controller })
const squaresOf = (g: GameState) => ((g.prompts[0]?.data?.squares ?? []) as { x: number; y: number }[]).map((s) => `${s.x},${s.y}`)
const walked = (g: GameState, u: UnitState) =>
  ((g.flow?.moveAnim ?? []) as { unitId: string }[]).some((a) => a.unitId === u.id)

describe('"May take a step": any legal step of its own, not only an orthogonal one', () => {
  it('Kite Archer with Airborne may step diagonally after its ranged strike', () => {
    const g = board()
    const archer = summonCard(g, 0, 'Kite Archer', 1, 1)
    grant(g, archer, 'airborne')
    getScript('Kite Archer')!.afterRangedStrike!(makeCtx(g, archer.id, 0, []), archer)
    expect(squaresOf(g)).toContain('0,0')
    answer(g, { x: 0, y: 0 })
    expect(at(archer)).toBe('0,0')
    expect(walked(g, archer), 'a real walk, animated').toBe(true)
  })

  it('Questing Beast with Airborne may step diagonally at the end of the turn', () => {
    const g = board()
    const beast = summonCard(g, 0, 'Questing Beast', 1, 1)
    grant(g, beast, 'airborne')
    getScript('Questing Beast')!.endOfTurn!(makeCtx(g, beast.id, 0, []))
    answer(g, { x: 2, y: 2 })
    expect(at(beast)).toBe('2,2')
  })

  it('Bladedancer with Airborne may step diagonally after her first attack', () => {
    const g = board()
    const av = avatarOf(g, 0)
    av.name = 'Bladedancer'; g.cards[av.cardId].name = 'Bladedancer'
    av.x = 1; av.y = 1
    grant(g, av, 'airborne')
    getScript('Bladedancer')!.afterAttack!(makeCtx(g, av.id, 0, []), av)
    answer(g, { x: 0, y: 2 })
    expect(at(av)).toBe('0,2')
    expect(walked(g, av), 'her own step, not a teleport').toBe(true)
  })

  it('Tringh Constrictor with Airborne may slither diagonally, then constrict a minion there', () => {
    const g = board()
    const snake = summonCard(g, 0, 'Tringh Constrictor', 1, 1); snake.enteredTurn = -1
    grant(g, snake, 'airborne')
    const prey = summonCard(g, 1, 'Wild Boars', 0, 0)
    act(g, 0, { t: 'activate', sourceId: snake.id, ability: 'constrict' })
    answer(g, { x: 0, y: 0 })
    expect(at(snake)).toBe('0,0')
    answer(g, [prey.id])
    expect(g.units[prey.id]?.carriedBy).toBe(snake.id)
  })
})

describe('Second Wind: an allied minion takes a step of its own', () => {
  it('an Airborne minion may step diagonally', () => {
    const g = board()
    const wyvern = summonCard(g, 0, 'Wyvern', 1, 1)
    castMagic(g, 0, 'Second Wind', { targets: [wyvern.id] })
    expect(squaresOf(g)).toContain('0,0')
    answer(g, { x: 0, y: 0 })
    expect(at(wyvern)).toBe('0,0')
  })
})

describe('Leap Attack: a Burrowed minion may unburrow and strike the units there', () => {
  it('Cave Trolls rise to the surface and strike the enemy above them', () => {
    const g = board()
    const trolls = summonCard(g, 0, 'Cave Trolls', 1, 1, 'underground')
    const boars = summonCard(g, 1, 'Wild Boars', 1, 1)
    castMagic(g, 0, 'Leap Attack', { targets: [trolls.id] })
    answer(g, { x: 1, y: 1 }) // its own square: stay, or surface
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    answer(g, 'Rise to the surface')
    expect(trolls.region).toBe('surface')
    const struck = g.units[boars.id]
    expect(!struck || struck.damage > 0, 'the Wild Boars were struck').toBe(true)
  })

  it('picking its own square and staying keeps it underground', () => {
    const g = board()
    const trolls = summonCard(g, 0, 'Cave Trolls', 1, 1, 'underground')
    castMagic(g, 0, 'Leap Attack', { targets: [trolls.id] })
    answer(g, { x: 1, y: 1 })
    answer(g, 'Stay')
    expect(at(trolls)).toBe('1,1')
    expect(trolls.region).toBe('underground')
  })
})

describe('Archangel Michael: "takes a step" is mandatory', () => {
  it('asks for a square, and declining is refused', () => {
    const g = board()
    castMagic(g, 0, 'Archangel Michael', { at: { x: 1, y: 1 } })
    const p = g.prompts[0]
    expect(p?.kind, 'a square, not a site target').toBe('chooseSquare')
    actFail(g, 0, { t: 'prompt', promptId: p!.id, choice: null })
    answer(g, { x: 0, y: 0 }) // Airborne: diagonal
    const michael = Object.values(g.units).find((u) => u.name === 'Archangel Michael')
    expect(at(michael)).toBe('0,0')
  })
})

describe('"Step toward the closest" counts the unit\'s own steps (range of motion)', () => {
  // a corridor along row 1; (0,3) is a site cut off by the void at (0,2), (1,2), (1,3)
  function corridor(): GameState {
    const g = newGame(); keepBoth(g); g.turn = 3
    for (let x = 0; x < 4; x++) placeSite(g, 0, 'Rustic Village', x, 1)
    placeSite(g, 0, 'Rustic Village', 0, 3)
    return g
  }

  it('Crave Golem lumbers toward the minion it can reach, not the one across the void', () => {
    const g = corridor()
    const golem = summonCard(g, 0, 'Crave Golem', 0, 1); golem.enteredTurn = -5
    summonCard(g, 1, 'Foot Soldier', 0, 3) // 2 squares away, but unreachable
    summonCard(g, 1, 'Wild Boars', 3, 1) // 3 steps along the corridor
    getScript('Crave Golem')!.startOfEachTurn!(makeCtx(g, golem.id, 0, []), 0)
    expect(at(golem)).toBe('1,1')
  })

  it('Persecutor stalks toward the Evil he can reach, not the one across the void', () => {
    const g = corridor()
    const av = avatarOf(g, 0)
    av.name = 'Persecutor'; g.cards[av.cardId].name = 'Persecutor'
    av.x = 0; av.y = 1
    summonCard(g, 1, 'Escyllion Cyclops', 0, 3).enteredTurn = 0
    summonCard(g, 1, 'Escyllion Cyclops', 3, 1).enteredTurn = 0
    const zeal = getScript('Persecutor')!.abilities!.find((a) => a.key === 'zeal')!
    zeal.effect(makeCtx(g, av.id, 0, []))
    answer(g, 'steps toward the closest Evil')
    expect(at(av)).toBe('1,1')
    expect(walked(g, av), 'his own step, not a teleport').toBe(true)
  })
})

describe('Joust!: both take a step of their own to swap places', () => {
  it('the swap is a real walk', () => {
    const g = board()
    const knight = summonCard(g, 0, 'Wyvern', 1, 1)
    const foe = summonCard(g, 1, 'Cave Trolls', 1, 2)
    castMagic(g, 0, 'Joust!', { targets: [knight.id, foe.id] })
    expect(at(knight)).toBe('1,2')
    expect(walked(g, knight)).toBe(true)
  })

  it('Old Salt Anchorman keeps his nearby ally from the enemy spell\'s step: no joust', () => {
    const g = board()
    const knight = summonCard(g, 0, 'Wyvern', 1, 1)
    const foe = summonCard(g, 1, 'Cave Trolls', 1, 2)
    summonCard(g, 1, 'Old Salt Anchorman', 2, 3)
    castMagic(g, 0, 'Joust!', { targets: [knight.id, foe.id] })
    expect(at(knight)).toBe('1,1')
    expect(at(foe)).toBe('1,2')
  })
})

describe('Aino: the edge-crossing step is her own', () => {
  it('slips across and gains Stealth, walking there', () => {
    const g = board()
    const aino = summonCard(g, 0, 'Aino', 1, 0)
    getScript('Aino')!.endOfTurn!(makeCtx(g, aino.id, 0, []))
    answer(g, true)
    expect(at(aino)).toBe('1,3')
    expect(aino.stealth).toBe(true)
    expect(walked(g, aino), 'a step, not a teleport').toBe(true)
  })

  it('an Immobile Aino can\'t take it', () => {
    const g = board()
    const aino = summonCard(g, 0, 'Aino', 1, 0)
    grant(g, aino, 'immobile')
    getScript('Aino')!.endOfTurn!(makeCtx(g, aino.id, 0, []))
    if (g.prompts[0]) answer(g, true)
    expect(at(aino)).toBe('1,0')
    expect(aino.stealth ?? false).toBe(false)
  })
})

describe('Call of the Sea: the step is their own, the submerge is forced', () => {
  it('"can\'t be moved by force" doesn\'t stop the step, but stops the submerge', () => {
    const g = newGame(); keepBoth(g)
    const water = placeSite(g, 0, 'Spring River', 1, 1)
    fillSites(g)
    const dreig = summonCard(g, 0, 'Talamh Dreig', 0, 1)
    getScript('Call of the Sea')!.onCast!(makeCtx(g, water.id, 0, [{ site: water.id }]))
    expect(at(dreig)).toBe('1,1')
    expect(dreig.region).toBe('surface')
  })

  it('Old Salt Anchorman keeps a nearby ally from being submerged by an enemy spell', () => {
    const g = newGame(); keepBoth(g)
    const water = placeSite(g, 0, 'Spring River', 1, 1)
    fillSites(g)
    const boars = summonCard(g, 1, 'Wild Boars', 1, 1)
    summonCard(g, 1, 'Old Salt Anchorman', 2, 2) // nearby, not adjacent to the site
    getScript('Call of the Sea')!.onCast!(makeCtx(g, water.id, 0, [{ site: water.id }]))
    expect(boars.region).toBe('surface')
  })
})

describe('Innsmouth Dock: the lured minion takes a step of its own', () => {
  it('the lure is a real walk', () => {
    const g = board()
    const dock = placeSite(g, 0, 'Innsmouth Dock', 1, 1)
    const boars = summonCard(g, 1, 'Wild Boars', 1, 2)
    getScript('Innsmouth Dock')!.abilities![0].effect(makeCtx(g, dock.id, 0, [{ unit: boars.id }]))
    expect(at(boars)).toBe('1,1')
    expect(walked(g, boars)).toBe(true)
  })

  it('Old Salt Anchorman keeps a nearby ally from an enemy\'s lure', () => {
    const g = board()
    const dock = placeSite(g, 0, 'Innsmouth Dock', 1, 1)
    const boars = summonCard(g, 1, 'Wild Boars', 1, 2)
    summonCard(g, 1, 'Old Salt Anchorman', 2, 3)
    getScript('Innsmouth Dock')!.abilities![0].effect(makeCtx(g, dock.id, 0, [{ unit: boars.id }]))
    expect(at(boars)).toBe('1,2')
  })
})

describe('Sturmgeist: closes on the enemy that cast, then strikes it', () => {
  it('chases a minion Spellcaster, not the enemy Avatar', () => {
    const g = board()
    const geist = summonCard(g, 1, 'Sturmgeist', 4, 1)
    const wizard = summonCard(g, 0, 'Apprentice Wizard', 4, 2); wizard.enteredTurn = -1
    castMagic(g, 0, 'Browse', { casterId: wizard.id })
    expect(at(geist)).toBe('4,2')
    const hit = g.units[wizard.id]
    expect(!hit || hit.damage > 0, 'the Apprentice Wizard was struck').toBe(true)
  })
})

describe('Cerberus in Chains: can\'t move ITSELF away from its master', () => {
  it('may step closer to the Avatar, never farther', () => {
    const g = board()
    const av = avatarOf(g, 0)
    av.x = 2; av.y = 3
    const dog = summonCard(g, 0, 'Cerberus in Chains', 0, 1)
    const from = { x: 0, y: 1, region: 'surface' as const }
    expect(isLegalStep(g, dog, from, { x: 1, y: 1, region: 'surface' }), 'closer').toBe(true)
    expect(isLegalStep(g, dog, from, { x: 0, y: 0, region: 'surface' }), 'farther').toBe(false)
  })
})
