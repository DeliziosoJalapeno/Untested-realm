// A defender may be sent to the fight along a player-DECLARED route (the new human defend UX), not only
// auto-pathed. The route is validated like any move and must END on the fight square. A defender that
// reaches the square but is DISABLED there (a Faerie walking onto a Cold Iron Rod) does not count as a
// defender — so the attacked unit is offered no withdrawal (afterDefenders only prompts stayInFight when a
// real defender joined). The bot / pre-route client keep sending bare ids (auto-path) and are unaffected.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { applyAction, isDisabled, type ArtifactState } from '../src'

function fill(g: any) {
  for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) placeSite(g, 0, 'Spire', x, y)
}
function groundArtifact(g: any, player: 0 | 1, name: string, x: number, y: number): ArtifactState {
  const cardId = `ctest${g.nextId++}`
  g.cards[cardId] = { id: cardId, name, owner: player }
  const artId = `atest${g.nextId++}`
  const art: ArtifactState = { id: artId, cardId, name, conjuredBy: player, x, y, region: 'surface', carriedBy: null, tapped: false }
  g.artifacts[artId] = art
  return art
}
const defendPrompt = (g: any) => g.prompts.find((p: any) => p.kind === 'defend')
const answerDefend = (g: any, choice: any) => {
  const p = defendPrompt(g)!
  applyAction(g, p.player, { t: 'prompt', promptId: p.id, choice })
}

// Craft a fight + defend window directly, so we control candidacy/reachability (the real candidate filter
// would never offer an unreachable defender). Mirrors openDefendWindow's FightCtx so answering runs the real
// combat:defenders cont → afterDefenders → startFight.
function craftDefend(g: any, defenderSeat: 0 | 1, atk: any, tgt: any, candidates: string[], loc: any) {
  g.flow = g.flow ?? {}
  g.flow.battleUnits = [atk.id, tgt.id]
  const ctx = {
    attackerId: atk.id, isAttack: true, targetUnitId: tgt.id, siteId: undefined, defenderIds: [],
    targetStays: true, stage: 'strikeFirst', allocations: {}, struck: [],
    enemiesAtStart: Object.values(g.units).filter((u: any) => u.controller !== atk.controller).map((u: any) => u.id),
  }
  g.prompts.push({ id: `dcraft${g.nextId++}`, player: defenderSeat, kind: 'defend', title: 'Defend?', data: { candidates, attackLocation: loc, attackerId: atk.id, target: { unit: tgt.id } }, cont: 'combat:defenders', ctx })
}

describe('declared defender routes', () => {
  it('a far defender walks in along a DECLARED path ending on the fight square and defends', () => {
    const g: any = newGame(); keepBoth(g); fill(g)
    const target = summonCard(g, 1, 'Bone Jumble', 2, 2); target.enteredTurn = -5
    const atk = summonCard(g, 0, 'Bone Jumble', 2, 1); atk.enteredTurn = -5
    const defender = summonCard(g, 1, 'Bone Jumble', 3, 2); defender.enteredTurn = -5

    const res = applyAction(g, 0, { t: 'moveAttack', unitId: atk.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: target.id } })
    expect(res.ok).toBe(true)
    expect(defendPrompt(g), 'a defend window opened').toBeTruthy()

    // declare the route explicitly: (3,2) -> (2,2), ending on the fight square
    answerDefend(g, [{ unitId: defender.id, path: [{ x: 2, y: 2, region: 'surface' }] }])

    const walked = g.units[defender.id]
    expect(walked, 'defender survived the walk-in').toBeTruthy()
    expect([walked.x, walked.y], 'defender reached the fight square').toEqual([2, 2])
    expect(walked.tapped, 'defending taps the mover').toBe(true)
    // a real defender joined → the attacked unit is offered stay/withdraw
    expect(g.prompts.some((p: any) => p.kind === 'stayInFight'), 'withdrawal offered').toBe(true)
  })

  it('an invalid declared path (not ending on the fight square) falls back to auto-path', () => {
    const g: any = newGame(); keepBoth(g); fill(g)
    const target = summonCard(g, 1, 'Bone Jumble', 2, 2); target.enteredTurn = -5
    const atk = summonCard(g, 0, 'Bone Jumble', 2, 1); atk.enteredTurn = -5
    const defender = summonCard(g, 1, 'Bone Jumble', 3, 2); defender.enteredTurn = -5

    applyAction(g, 0, { t: 'moveAttack', unitId: atk.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: target.id } })
    // bogus route that does NOT end on the fight square → engine ignores it and auto-paths
    answerDefend(g, [{ unitId: defender.id, path: [{ x: 3, y: 1, region: 'surface' }] }])

    expect([g.units[defender.id].x, g.units[defender.id].y], 'auto-pathed to the fight anyway').toEqual([2, 2])
    expect(g.prompts.some((p: any) => p.kind === 'stayInFight')).toBe(true)
  })

  it('a defender DISABLED on the fight square (Faerie onto Cold Iron Rod) does not count — no withdrawal', () => {
    const g: any = newGame(); keepBoth(g); fill(g)
    const target = summonCard(g, 1, 'Bone Jumble', 2, 2); target.enteredTurn = -5 // a Beast, unaffected by the Rod
    const atk = summonCard(g, 0, 'Bone Jumble', 2, 1); atk.enteredTurn = -5
    groundArtifact(g, 1, 'Cold Iron Rod', 2, 2) // Faeries here are disabled
    const pixies = summonCard(g, 1, 'Sling Pixies', 3, 2); pixies.enteredTurn = -5 // a Faerie

    applyAction(g, 0, { t: 'moveAttack', unitId: atk.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: target.id } })
    expect(defendPrompt(g)).toBeTruthy()
    answerDefend(g, [{ unitId: pixies.id, path: [{ x: 2, y: 2, region: 'surface' }] }])

    const p = g.units[pixies.id]
    expect([p.x, p.y], 'the Faerie did reach the fight square').toEqual([2, 2])
    expect(isDisabled(g, p), 'but the Cold Iron Rod disables it there').toBe(true)
    // disabled → not a defender → the attacked unit is offered NO withdrawal
    expect(g.prompts.some((pr: any) => pr.kind === 'stayInFight'), 'no withdrawal when no real defender reached').toBe(false)
  })
})

describe('declared routes that fail → no defense, and the undefended target cannot retreat', () => {
  const SURF = (x: number, y: number) => ({ x, y, region: 'surface' as const })

  it('a route that cannot resolve (defender boxed in by voids) → target undefended and unable to retreat', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 1, 1) // the fight square
    placeSite(g, 1, 'Spire', 4, 3) // the defender's lone site — every neighbour is a void, so it can't step off
    const atk = summonCard(g, 0, 'Bone Jumble', 1, 1); atk.enteredTurn = -5
    const tgt = summonCard(g, 1, 'Bone Jumble', 1, 1); tgt.enteredTurn = -5
    const def = summonCard(g, 1, 'Bone Jumble', 4, 3); def.enteredTurn = -5
    craftDefend(g, 1, atk, tgt, [def.id], SURF(1, 1))
    // declare a route it physically can't walk (off its island); it has no auto-path either
    answerDefend(g, [{ unitId: def.id, path: [SURF(3, 3), SURF(1, 1)] }])

    expect([g.units[def.id].x, g.units[def.id].y], 'the defender never left its square').toEqual([4, 3])
    expect(g.units[def.id].tapped, 'it never committed (untapped)').toBe(false)
    expect(g.prompts.some((p: any) => p.kind === 'stayInFight'), 'nothing defended → no withdrawal offered').toBe(false)
    expect(g.units[tgt.id], 'the undefended target took the attack (1/1 trade)').toBeUndefined()
  })

  it('a route that resolves onto a disabling square (Faerie onto Cold Iron Rod) → still no defense, no retreat', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 1, 1); placeSite(g, 0, 'Spire', 2, 1)
    const atk = summonCard(g, 0, 'Bone Jumble', 1, 1); atk.enteredTurn = -5
    const tgt = summonCard(g, 1, 'Bone Jumble', 1, 1); tgt.enteredTurn = -5 // a Beast — the Rod doesn't touch it
    groundArtifact(g, 1, 'Cold Iron Rod', 1, 1) // Faeries on the fight square are disabled
    const pix = summonCard(g, 1, 'Sling Pixies', 2, 1); pix.enteredTurn = -5 // a Faerie
    craftDefend(g, 1, atk, tgt, [pix.id], SURF(1, 1))
    answerDefend(g, [{ unitId: pix.id, path: [SURF(1, 1)] }])

    expect([g.units[pix.id].x, g.units[pix.id].y], 'the Faerie reached the fight square').toEqual([1, 1])
    expect(isDisabled(g, g.units[pix.id]), 'but it is disabled there').toBe(true)
    expect(g.prompts.some((p: any) => p.kind === 'stayInFight'), 'disabled defender does not count → no withdrawal').toBe(false)
    expect(g.units[tgt.id], 'the target was hit undefended').toBeUndefined()
  })

  it('positive control: a route that DOES resolve lets the attacked unit choose to retreat', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 1, 1); placeSite(g, 0, 'Spire', 2, 1)
    const atk = summonCard(g, 0, 'Bone Jumble', 1, 1); atk.enteredTurn = -5
    const tgt = summonCard(g, 1, 'Bone Jumble', 1, 1); tgt.enteredTurn = -5
    const def = summonCard(g, 1, 'Bone Jumble', 2, 1); def.enteredTurn = -5
    craftDefend(g, 1, atk, tgt, [def.id], SURF(1, 1))
    answerDefend(g, [{ unitId: def.id, path: [SURF(1, 1)] }])

    expect([g.units[def.id].x, g.units[def.id].y], 'the defender reached the fight').toEqual([1, 1])
    const stay = g.prompts.find((p: any) => p.kind === 'stayInFight')
    expect(stay, 'a real defender joined → the target is offered stay/withdraw').toBeTruthy()
    // the target withdraws (choice=false) → it leaves the fight unharmed; the defender takes the blow
    applyAction(g, stay.player, { t: 'prompt', promptId: stay.id, choice: false })
    expect(g.units[tgt.id], 'the target retreated and survived').toBeTruthy()
  })
})
