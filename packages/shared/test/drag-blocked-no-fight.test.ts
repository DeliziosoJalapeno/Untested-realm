// Pudge Butcher / Meat Hook / Grapple Shot all "drag then may fight/strike it WHEN IT ARRIVES". If the
// drag is blocked short (Perilous Bridge's push-ban, Cage of Sidrak, Bailey), the unit never arrives — so
// there must be NO fight/strike, and NO fight/strike PROMPT. (Grapple Shot additionally used to strike
// from afar because its cont lacked an arrival check.)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, giveArtifact } from './helpers'
import { getScript, makeCtx, avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

// keep both avatars out of the x=2 firing lane so the hook finds exactly one candidate (not the avatar)
function clearLane(g: GameState) {
  avatarOf(g, 0).x = 0; avatarOf(g, 0).y = 0
  avatarOf(g, 1).x = 4; avatarOf(g, 1).y = 0
}
// a column of sites with a Perilous Bridge (player 1) at (2,2): its push-ban seals the (2,2)<->(2,1) border
function bridgeColumn(g: GameState) {
  clearLane(g)
  for (const y of [0, 1, 3]) placeSite(g, 0, 'Rustic Village', 2, y)
  placeSite(g, 1, 'Perilous Bridge', 2, 2) // controller 1 → banned "top border" is (2,2)<->(2,1)
}
const run = (g: GameState, card: string, cont: string, srcId: string, c: any, choice: any) =>
  getScript(card)!.conts![cont](makeCtx(g, srcId, 0, []), c, choice)

describe('a drag blocked short triggers no fight / strike (nor its prompt)', () => {
  it('Pudge Butcher: hook blocked at the Perilous Bridge → no "Fight?" prompt', () => {
    const g = newGame() as GameState; keepBoth(g); bridgeColumn(g)
    const pudge = summonCard(g, 0, 'Pudge Butcher', 2, 0); pudge.enteredTurn = -1
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 3); foe.enteredTurn = -1
    run(g, 'Pudge Butcher', 'hook', pudge.id, {}, 'n') // hook +y: hits the foe, drag back is bridge-blocked
    expect(g.units[foe.id]?.y, 'dragged only as far as the bridge, not onto Pudge').toBe(2)
    expect(g.prompts.length, 'no spurious Fight? prompt when it never arrived').toBe(0)
  })

  it('Meat Hook: same — a blocked pull raises no Fight? prompt', () => {
    const g = newGame() as GameState; keepBoth(g); bridgeColumn(g)
    const bearer = summonCard(g, 0, 'Bone Jumble', 2, 0); bearer.enteredTurn = -1
    giveArtifact(g, bearer, 'Meat Hook')
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 3); foe.enteredTurn = -1
    const hookId = bearer.carrying[0]
    run(g, 'Meat Hook', 'hook', hookId, { bearerId: bearer.id }, 'n')
    expect(g.units[foe.id]?.y, 'pulled only to the bridge').toBe(2)
    expect(g.prompts.length, 'no Fight? prompt').toBe(0)
  })

  it('Grapple Shot: ally blocked at the bridge → no strike prompt AND no strike', () => {
    const g = newGame() as GameState; keepBoth(g); bridgeColumn(g)
    const ally = summonCard(g, 0, 'Bone Jumble', 2, 0); ally.enteredTurn = -1
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 3); foe.enteredTurn = -1 // 6/6, would survive a stray strike
    run(g, 'Grapple Shot', 'fire', avatarOf(g, 0).id, { allyId: ally.id }, 'n')
    expect(g.units[ally.id]?.y, 'ally stopped before the bridge border').toBe(1)
    expect(g.prompts.length, 'no strike-on-arrival prompt when it never arrived').toBe(0)
    expect(g.units[foe.id]?.damage ?? 0, 'the foe is NOT struck from afar').toBe(0)
  })

  it('positive control — an unobstructed hook DOES arrive and prompt', () => {
    const g = newGame() as GameState; keepBoth(g); clearLane(g)
    for (const y of [0, 1, 2, 3]) placeSite(g, 0, 'Rustic Village', 2, y) // no bridge
    const pudge = summonCard(g, 0, 'Pudge Butcher', 2, 0); pudge.enteredTurn = -1
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 3); foe.enteredTurn = -1
    run(g, 'Pudge Butcher', 'hook', pudge.id, {}, 'n')
    expect([g.units[foe.id]?.x, g.units[foe.id]?.y], 'dragged onto Pudge').toEqual([2, 0])
    expect(g.prompts[0]?.kind, 'the Fight? prompt fires on arrival').toBe('yesNo')
  })
})
