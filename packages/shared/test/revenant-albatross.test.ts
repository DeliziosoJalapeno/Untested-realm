// Revered Revenant: "Has 0 power unless adjacent to an allied Ward." Rulebook — "adjacent" INCLUDES
// the card's own square, and an "allied Ward" can be a warded unit OR a warded site.
// Accursed Albatross: its death-curse kills the killer's nearby allies, but Ward protects them.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { effAttack, checkStateBased, wardUnit, getScript, makeCtx } from '../src'

describe('Revered Revenant — adjacency includes its own square; unit OR site Wards', () => {
  it('has 0 power with no allied Ward adjacent', () => {
    const g = newGame(); keepBoth(g)
    const rev = summonCard(g, 0, 'Revered Revenant', 2, 2)
    checkStateBased(g)
    expect(effAttack(g, rev)).toBe(0)
  })

  it('gets full power from an allied warded unit on its OWN square', () => {
    const g = newGame(); keepBoth(g)
    const rev = summonCard(g, 0, 'Revered Revenant', 2, 2)
    const ally = summonCard(g, 0, 'Apprentice Wizard', 2, 2) // co-located
    wardUnit(g, ally)
    checkStateBased(g)
    expect(effAttack(g, rev)).toBe(3)
  })

  it('gets full power from the warded SITE it stands on', () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2); site.ward = true
    const rev = summonCard(g, 0, 'Revered Revenant', 2, 2)
    checkStateBased(g)
    expect(effAttack(g, rev)).toBe(3)
  })

  it('gets full power from an allied Ward on an ADJACENT square', () => {
    const g = newGame(); keepBoth(g)
    const rev = summonCard(g, 0, 'Revered Revenant', 2, 2)
    const ally = summonCard(g, 0, 'Apprentice Wizard', 2, 3); wardUnit(g, ally)
    checkStateBased(g)
    expect(effAttack(g, rev)).toBe(3)
  })

  it('is NOT helped by an ENEMY Ward on its square', () => {
    const g = newGame(); keepBoth(g)
    const rev = summonCard(g, 0, 'Revered Revenant', 2, 2)
    const foe = summonCard(g, 1, 'Apprentice Wizard', 2, 2); wardUnit(g, foe)
    checkStateBased(g)
    expect(effAttack(g, rev)).toBe(0)
  })
})

describe('Accursed Albatross — the death-curse respects Ward', () => {
  function run(wardAlly: boolean) {
    const g = newGame(); keepBoth(g)
    const killer = summonCard(g, 0, 'Apprentice Wizard', 2, 2)
    const ally = summonCard(g, 0, 'Apprentice Wizard', 2, 3) // nearby the killer
    if (wardAlly) wardUnit(g, ally)
    const alba = summonCard(g, 1, 'Accursed Albatross', 4, 4)
    g.flow = g.flow ?? {}
    ;(g.flow as any).killerByVictim = { [alba.id]: [{ id: killer.id, x: killer.x, y: killer.y, controller: 0 }] }
    getScript('Accursed Albatross')!.deathrite!(makeCtx(g, alba.id, 1, []))
    return { g, ally }
  }

  it('kills an unwarded allied minion nearby the killer', () => {
    const { g, ally } = run(false)
    expect(g.units[ally.id], 'unwarded ally is cursed to death').toBeUndefined()
  })

  it('spares a WARDED minion — its ward breaks instead', () => {
    const { g, ally } = run(true)
    expect(g.units[ally.id], 'warded ally survives the curse').toBeTruthy()
    expect(g.units[ally.id]?.ward, 'but its ward broke').toBeFalsy()
  })
})
