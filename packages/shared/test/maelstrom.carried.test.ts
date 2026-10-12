import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, answer } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'

// The Maelström "pulls in each minion in this body of water one step." A CARRIED unit (a passenger on a
// mount, or a minion swallowed in a Brobdingnag Bullfrog's belly) is not independently in the water — it
// rides at its carrier's square. The Maelström must pull the CARRIER (its cargo follows automatically),
// never yank a carried/swallowed unit off on its own.
describe('Maelström and carried / swallowed units', () => {
  // A straight vertical body with the maw at (2,3). A carrier at (2,1) is TWO steps from the maw, so
  // its single pull lands on the NON-maw square (2,2) — where a buggy scan would then find the dragged
  // passenger and yank it an extra step, detaching it. That's the case this must guard.
  function waterBoard(): { g: GameState; mawId: string } {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Maelström', 2, 3) // the maw
    placeSite(g, 0, 'Maelström', 2, 2)
    placeSite(g, 0, 'Maelström', 2, 1)
    placeSite(g, 0, 'Maelström', 2, 0)
    return { g, mawId: Object.values(g.sites).find((s) => s.x === 2 && s.y === 3)!.id }
  }

  it('pulls the carrier and its passenger moves with it — the passenger is never pulled off', () => {
    const { g, mawId } = waterBoard()
    // a mount carrying a passenger, both at (2,1) — one inward step to (2,2), still short of the maw
    const mount = summonCard(g, 0, 'War Horse', 2, 1)
    const rider = summonCard(g, 0, 'Bone Jumble', 2, 1)
    mount.carryingUnits = [rider.id]
    rider.carriedBy = mount.id

    getScript('Maelström')!.startOfTurn!(makeCtx(g, mawId, 0, []))
    answer(g, true) // let it pull
    expect(g.prompts.length, 'single inward step for each → no tie to resolve').toBe(0)

    expect([mount.x, mount.y], 'the mount is pulled one step closer').toEqual([2, 2])
    expect([rider.x, rider.y], 'the passenger rode along to the same square (one step, not two)').toEqual([2, 2])
    expect(rider.carriedBy, 'and is still carried — it was never pulled off').toBe(mount.id)
    expect(mount.carryingUnits).toContain(rider.id)
  })

  it('does not target a minion swallowed in a Brobdingnag Bullfrog', () => {
    const { g, mawId } = waterBoard()
    const frog = summonCard(g, 0, 'Brobdingnag Bullfrog', 2, 1)
    const meal = summonCard(g, 1, 'Bone Jumble', 2, 1) // an enemy minion, swallowed
    frog.carryingUnits = [meal.id]
    meal.carriedBy = frog.id

    getScript('Maelström')!.startOfTurn!(makeCtx(g, mawId, 0, []))
    answer(g, true)
    expect(g.prompts.length).toBe(0)

    expect([frog.x, frog.y], 'the Bullfrog itself is pulled one step closer').toEqual([2, 2])
    expect([meal.x, meal.y], 'the meal stays in the belly at the Bullfrog’s square (not yanked ahead)').toEqual([2, 2])
    expect(meal.carriedBy, 'the swallowed minion is never freed by the pull').toBe(frog.id)
  })
})
