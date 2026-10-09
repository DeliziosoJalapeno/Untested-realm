// 0.4.8 batch fixes:
//  - Sister Stefánia silences only minions in HER region
//  - Grim Guisarme doubles a RANGED strike (deals & takes)
//  - Arcane Barrage applies Merlin's Tower's "3 less" to its X (free for X<=3)
//  - Kite Archer's after-ranged-strike step is optional (stay-put offered)
//  - Archimago lets you pick which spellcaster casts the echoed (positional) spell
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, answer, giveMana, waiveThreshold, summonCard, giveArtifact, placeSite, injectToHand } from './helpers'
import { avatarOf, getScript, makeCtx, type GameState, type PlayerId } from '../src'
import { shootProjectile } from '../src/engine/combat'

function toCem(g: GameState, p: PlayerId, name: string) {
  const id = `cm${g.nextId++}`; (g.cards as any)[id] = { id, name, owner: p }; g.players[p].cemetery.push(id); return id
}

describe('Sister Stefánia — region-bound silence', () => {
  const silences = (g: GameState, selfId: string, unit: any) => getScript('Sister Stefánia')!.silencesUnit!(g, selfId, unit)
  it('silences an adjacent minion in her OWN region, but not one in another region', () => {
    const g = newGame(); keepBoth(g)
    const stef = summonCard(g, 0, 'Sister Stefánia', 2, 2)
    const surfaceNeighbour = summonCard(g, 1, 'Bone Jumble', 2, 3, 'surface')
    const buriedNeighbour = summonCard(g, 1, 'Bone Jumble', 2, 3, 'underground')
    expect(silences(g, stef.id, surfaceNeighbour), 'same-region neighbour is silenced').toBe(true)
    expect(silences(g, stef.id, buriedNeighbour), 'a burrowed minion beneath is NOT silenced').toBe(false)
    expect(silences(g, stef.id, stef), 'never silences herself').toBe(false)
  })
})

describe('Grim Guisarme — a ranged strike is a strike', () => {
  function enemyAvatarLifeDrop(g: GameState, setup: (shooter: any, avatar: any) => void): number {
    const shooter = summonCard(g, 0, 'Stygian Archers', 2, 2) // Ranged, Attack 3
    shooter.enteredTurn = -5
    const ea = avatarOf(g, 1); ea.x = 3; ea.y = 2; ea.region = 'surface'
    const before = ea.life!
    setup(shooter, ea)
    shootProjectile(g, 0, shooter.id, 'e', { x: shooter.x, y: shooter.y }, { skipTapCheck: true })
    return before - avatarOf(g, 1).life!
  }
  it('baseline: a plain ranged strike deals its attack (3)', () => {
    const g = newGame(); keepBoth(g)
    expect(enemyAvatarLifeDrop(g, () => {})).toBe(3)
  })
  it('bearer DEALS double: shooter carrying Grim Guisarme hits for 6', () => {
    const g = newGame(); keepBoth(g)
    expect(enemyAvatarLifeDrop(g, (shooter) => giveArtifact(g, shooter, 'Grim Guisarme'))).toBe(6)
  })
  it('bearer TAKES double: victim carrying Grim Guisarme is hit for 6', () => {
    const g = newGame(); keepBoth(g)
    expect(enemyAvatarLifeDrop(g, (_s, avatar) => giveArtifact(g, avatar, 'Grim Guisarme'))).toBe(6)
  })
})

describe("Arcane Barrage × Merlin's Tower — X discounted by 3 (free for X<=3)", () => {
  function setupTower(g: GameState) {
    g.flow = g.flow ?? {}; (g.flow as any).judgeThresh = { 0: { air: 5, earth: 5, fire: 5, water: 5 } }
    const tower = placeSite(g, 0, "Merlin's Tower", 2, 0)
    getScript("Merlin's Tower")!.genesis!(makeCtx(g, tower.id, 0, []) as any)
    waiveThreshold(g, 0)
    return tower
  }
  it('with 0 mana you can still fire X=3 for free through the tower', () => {
    const g = newGame(); keepBoth(g)
    const tower = setupTower(g)
    g.players[0].mana = 0
    const cardId = injectToHand(g, 0, 'Arcane Barrage')
    act(g, 0, { t: 'castSpell', cardId, casterId: tower.id })
    answer(g, 'surface') // the site caster asks which region to fire from
    answer(g, '3')  // X = 3 → costs 3 - 3 = 0
    answer(g, 'e')  // direction
    expect(g.players[0].mana, 'X=3 was free under the tower discount').toBe(0)
    expect(g.prompts.length).toBe(0)
  })
  it('X above the discount still costs the remainder (X=5 with 2 mana → pay 2)', () => {
    const g = newGame(); keepBoth(g)
    const tower = setupTower(g)
    g.players[0].mana = 2
    const cardId = injectToHand(g, 0, 'Arcane Barrage')
    act(g, 0, { t: 'castSpell', cardId, casterId: tower.id })
    answer(g, 'surface')
    answer(g, '5')  // X = 5 → costs 5 - 3 = 2
    answer(g, 'e')
    expect(g.players[0].mana, 'paid 5-3=2').toBe(0)
  })
})

describe('Kite Archer — the after-strike step is optional', () => {
  it('offers a "stay put" square and takes no step when chosen', () => {
    const g = newGame(); keepBoth(g)
    const ka = summonCard(g, 0, 'Kite Archer', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 3) // a legal adjacent step target
    getScript('Kite Archer')!.afterRangedStrike!(makeCtx(g, ka.id, 0, []), ka)
    expect(g.prompts.length, 'a step is offered').toBe(1)
    const squares = (g.prompts[0] as any).data.squares as { x: number; y: number }[]
    expect(squares.some((s) => s.x === 2 && s.y === 2), 'its own square is offered (stay put)').toBe(true)
    answer(g, { x: 2, y: 2 }) // stay
    expect(ka.x, 'did not move').toBe(2); expect(ka.y).toBe(2)
    expect(g.prompts.length).toBe(0)
  })
})

describe('Archimago — any spellcaster may cast the echoed spell', () => {
  it('prompts which spellcaster fires an echoed projectile when more than one exists', () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.name = 'Archimago'
    const caster = summonCard(g, 0, 'Bone Jumble', 4, 2)
    caster.modifiers = [{ kind: 'keyword', keyword: 'spellcaster' } as any] // a second spellcaster
    for (let i = 0; i < 3; i++) toCem(g, 0, 'Firebolts') // a projectile (position matters)
    giveMana(g, 0, 10); waiveThreshold(g, 0)
    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'echo' })
    answer(g, [0]); answer(g, [0, 1]) // echo Firebolts, banish the other two
    expect(g.prompts[0]?.kind, 'caster choice offered').toBe('chooseTargets')
    expect(String(g.prompts[0]?.title)).toMatch(/which spellcaster/i)
    const cands = (g.prompts[0] as any).data.candidates as string[]
    expect(cands).toContain(av.id)
    expect(cands).toContain(caster.id)
  })
})
