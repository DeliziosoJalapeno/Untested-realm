// The Green Knight: "Whenever an enemy minion CAN attack The Green Knight, it MUST." Enforced
// proactively — at the start of the enemy's turn and after each of their actions, every untapped enemy
// minion able to attack it (in place OR by moving) is compelled to. It's an ATTACK (defenders may be
// called). When several can attack, THEIR controller chooses the order.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'
import { enforceForcedAttacks } from '../src/engine/combat'

describe('The Green Knight taunt', () => {
  it('compels a single co-located enemy minion to attack it (in place)', () => {
    const g = newGame(42, 1); keepBoth(g) // player 1 to act
    g.activePlayer = 1
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const gk = summonCard(g, 0, 'The Green Knight', 2, 2); gk.enteredTurn = -5
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 2); foe.enteredTurn = -5 // 6 power, co-located

    enforceForcedAttacks(g)

    expect(g.prompts[0], 'no defenders → the attack resolves without a defend prompt').toBeFalsy()
    expect(foe.tapped, 'the compelled minion attacked (and so is tapped)').toBe(true)
    expect(g.units[gk.id]?.damage, 'the Green Knight took the strike').toBe(6)
  })

  it('compels a minion to MOVE and attack when it can reach the Knight', () => {
    const g = newGame(42, 1); keepBoth(g)
    g.activePlayer = 1
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 3) // the attacker's starting square
    const gk = summonCard(g, 0, 'The Green Knight', 2, 2); gk.enteredTurn = -5
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 3); foe.enteredTurn = -5 // one step away

    enforceForcedAttacks(g)

    expect(foe.tapped, 'it moved and attacked').toBe(true)
    expect(foe.x === 2 && foe.y === 2, 'it moved onto the Knight to strike').toBe(true)
    expect(g.units[gk.id]?.damage).toBe(6)
  })

  it('lets the minions’ controller choose the order when several can attack', () => {
    const g = newGame(42, 1); keepBoth(g)
    g.activePlayer = 1
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const gk = summonCard(g, 0, 'The Green Knight', 2, 2); gk.enteredTurn = -5
    const a = summonCard(g, 1, 'Escyllion Cyclops', 2, 2); a.enteredTurn = -5
    const b = summonCard(g, 1, 'Escyllion Cyclops', 2, 2); b.enteredTurn = -5

    enforceForcedAttacks(g)

    const p = g.prompts[0]
    expect(p?.player, 'the attacking player chooses the order').toBe(1)
    expect(String(p?.title)).toMatch(/compels/i)
    expect(([...(p!.data as any).candidates] as string[]).sort()).toEqual([a.id, b.id].sort())

    answer(g, [b.id]) // controller sends b first
    expect(b.tapped, 'the chosen minion attacked first').toBe(true)
  })

  it('does NOT compel a minion that cannot reach the Knight', () => {
    const g = newGame(42, 1); keepBoth(g)
    g.activePlayer = 1
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 0, 0)
    const gk = summonCard(g, 0, 'The Green Knight', 2, 2); gk.enteredTurn = -5
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 0, 0); foe.enteredTurn = -5 // far away, 1 movement

    enforceForcedAttacks(g)

    expect(g.prompts[0]).toBeFalsy()
    expect(foe.tapped).toBe(false)
    expect(g.units[gk.id]?.damage ?? 0).toBe(0)
  })

  it('a silenced Green Knight has no taunt', () => {
    const g = newGame(42, 1); keepBoth(g)
    g.activePlayer = 1
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const gk = summonCard(g, 0, 'The Green Knight', 2, 2); gk.enteredTurn = -5; gk.silenced = true
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 2); foe.enteredTurn = -5

    enforceForcedAttacks(g)

    expect(foe.tapped, 'the taunt is off, so no compulsion').toBe(false)
  })

  it('fires at the START of the enemy’s turn (via the applyAction boundary)', () => {
    const g = newGame(42, 1); keepBoth(g) // player 1 acts first; player 0 owns the Knight-hunter
    g.activePlayer = 1
    placeSite(g, 1, 'Rustic Village', 2, 2)
    const gk = summonCard(g, 1, 'The Green Knight', 2, 2); gk.enteredTurn = -5 // player 1's Knight
    const foe = summonCard(g, 0, 'Escyllion Cyclops', 2, 2); foe.enteredTurn = -5 // player 0's minion

    // player 1 owns a defender: put their avatar next to the Knight so the defend window is meaningful
    g.units[g.players[1].avatarUnitId].x = 2; g.units[g.players[1].avatarUnitId].y = 3

    // player 1 ends their turn → player 0's turn begins in the START phase with a mandatory draw
    act(g, 1, { t: 'endTurn' })
    answer(g, 'spellbook') // resolve the start-of-turn draw → enter the main phase

    // entering the main phase runs the boundary check, which compels player 0's minion at once
    expect(foe.tapped, 'compelled at the start of player 0’s main phase').toBe(true)
    // it's an ATTACK (not a fight): the Green Knight's controller gets a defend window
    expect(g.prompts[0]?.kind).toBe('defend')
    expect(g.prompts[0]?.player, 'the Knight’s controller may call in defenders').toBe(1)
  })
})
