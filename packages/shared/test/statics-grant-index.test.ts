// Baseline behaviour of the static keyword/power GRANT system — written BEFORE the
// granter/remover-index refactor so it pins the exact semantics the refactor must
// preserve. Covers the three structurally self-only granters being migrated to a
// direct self-eval path (Angel Ascendant, Grand Old Boar, Hyperparasite), a cross-
// unit granter (Dwarven Digging Team), a cross-unit remover (Sky Baron), disable
// gating, and coexistence of multiple self-granters.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { effKeywords, effAttack, isDisabled } from '../src/engine/statics'
import { checkStateBased, getCard } from '../src'

const printedAtk = (name: string) => getCard(name).attack ?? 0

describe('static self-grants (Angel Ascendant / Grand Old Boar / Hyperparasite)', () => {
  it('Angel Ascendant: Airborne + power +1 WHILE warded; nothing while unwarded', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const angel = summonCard(g, 0, 'Angel Ascendant', 2, 2); angel.enteredTurn = -1

    // unwarded → printed, no airborne
    expect(effKeywords(g, g.units[angel.id]).airborne ?? false, 'no airborne unwarded').toBe(false)
    expect(effAttack(g, g.units[angel.id]), 'printed power unwarded').toBe(printedAtk('Angel Ascendant'))

    // warded → airborne + +1
    g.units[angel.id].ward = true
    expect(effKeywords(g, g.units[angel.id]).airborne, 'airborne while warded').toBe(true)
    expect(effAttack(g, g.units[angel.id]), '+1 power while warded').toBe(printedAtk('Angel Ascendant') + 1)
  })

  it('Angel Ascendant: a DISABLED angel loses BOTH the airborne and the +1 (ability, not characteristic)', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const spider = summonCard(g, 1, 'Root Spider', 2, 2); spider.enteredTurn = -1; spider.region = 'underground'
    const angel = summonCard(g, 0, 'Angel Ascendant', 2, 2); angel.enteredTurn = -1
    g.units[angel.id].ward = true
    checkStateBased(g)

    expect(isDisabled(g, g.units[angel.id]), 'Root Spider disables the angel').toBe(true)
    expect(effKeywords(g, g.units[angel.id]).airborne ?? false, 'disabled → no airborne even warded').toBe(false)
    expect(effAttack(g, g.units[angel.id]), 'disabled → printed power even warded').toBe(printedAtk('Angel Ascendant'))
  })

  it('Grand Old Boar: Charge only when a Squeaker is in a cemetery', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const boar = summonCard(g, 0, 'Grand Old Boar', 2, 2); boar.enteredTurn = -1

    expect(effKeywords(g, g.units[boar.id]).charge ?? false, 'no charge, no dead Squeakers').toBe(false)
    const cid = `sqk${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Squeakers', owner: 0 } as any
    g.players[0].cemetery.push(cid)
    expect(effKeywords(g, g.units[boar.id]).charge, 'charge once a Squeaker is dead').toBe(true)
  })

  it('Hyperparasite: Immobile only while carrying a minion', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const hyper = summonCard(g, 0, 'Hyperparasite', 2, 2); hyper.enteredTurn = -1

    expect(effKeywords(g, g.units[hyper.id]).immobile ?? false, 'mobile while empty').toBe(false)
    const prey = summonCard(g, 1, 'Bone Jumble', 2, 2)
    g.units[hyper.id].carryingUnits = [prey.id]; g.units[prey.id].carriedBy = hyper.id
    expect(effKeywords(g, g.units[hyper.id]).immobile, 'immobile while carrying').toBe(true)
  })

  it('two Angel Ascendants each grant ONLY to themselves (no cross-grant)', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [1, 2] as const) placeSite(g, 0, 'Rustic Village', x, 2)
    const a1 = summonCard(g, 0, 'Angel Ascendant', 1, 2); a1.enteredTurn = -1; g.units[a1.id].ward = true
    const a2 = summonCard(g, 0, 'Angel Ascendant', 2, 2); a2.enteredTurn = -1 // NOT warded

    expect(effKeywords(g, g.units[a1.id]).airborne, 'warded angel is airborne').toBe(true)
    expect(effKeywords(g, g.units[a2.id]).airborne ?? false, 'unwarded angel gains nothing from the other').toBe(false)
    expect(effAttack(g, g.units[a2.id]), 'unwarded angel keeps printed power').toBe(printedAtk('Angel Ascendant'))
  })
})

describe('static cross-unit grants/removes (must keep working)', () => {
  it('Dwarven Digging Team grants Burrowing to a NEARBY ally on a site (not itself, not the avatar)', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [1, 2] as const) placeSite(g, 0, 'Rustic Village', x, 2)
    const team = summonCard(g, 0, 'Dwarven Digging Team', 2, 2); team.enteredTurn = -1
    const ally = summonCard(g, 0, 'Bone Jumble', 1, 2); ally.enteredTurn = -1 // nearby, on a site

    expect(effKeywords(g, g.units[ally.id]).burrowing, 'nearby ally gains Burrowing').toBe(true)
    expect(effKeywords(g, g.units[team.id]).burrowing, 'the team itself has Burrowing (printed keyword)').toBe(true)
  })

  it('Sky Baron removes Airborne from OTHER minions (keeps its own)', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [1, 2] as const) placeSite(g, 0, 'Rustic Village', x, 2)
    summonCard(g, 0, 'Sky Baron', 1, 2).enteredTurn = -1
    const flyer = summonCard(g, 0, 'Bone Jumble', 2, 2); flyer.enteredTurn = -1
    g.units[flyer.id].modifiers.push({ kind: 'keyword', keyword: 'airborne' } as any)

    // without the Baron the modifier would grant airborne; the Baron strips it
    expect(effKeywords(g, g.units[flyer.id]).airborne ?? false, 'Sky Baron grounds other minions').toBe(false)
  })
})
