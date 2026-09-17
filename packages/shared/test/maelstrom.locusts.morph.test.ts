import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, injectToHand, answer, act } from './helpers'
import { getScript, makeCtx, type GameState, type PlayerId } from '../src'

// ── Maelström ───────────────────────────────────────────────────────────────
// "At the start of your turn, you may pull in each minion in this body of water one
// step." The Maelström's OWNER pulls EVERY minion (their own and the opponent's) and
// chooses the direction on a tie — the opponent is never prompted.
describe('Maelström: the owner pulls everything, opponent is never prompted', () => {
  function waterBoard(): { g: GameState; mawId: string } {
    const g = newGame(); keepBoth(g)
    // a small L-shaped body of water around the maw at (2,2)
    const maw = placeSite(g, 0, 'Maelström', 2, 2)
    placeSite(g, 0, 'Maelström', 2, 1)
    placeSite(g, 0, 'Maelström', 3, 2)
    placeSite(g, 0, 'Maelström', 3, 1)
    return { g, mawId: maw.id }
  }

  it('the tie-break direction prompt is addressed to the OWNER, not the pulled minion’s controller', () => {
    const { g, mawId } = waterBoard()
    // an ENEMY minion at (3,1): two inward steps toward the maw → a genuine tie
    const foe = summonCard(g, 1, 'Bone Jumble', 3, 1)

    getScript('Maelström')!.startOfTurn!(makeCtx(g, mawId, 0, []))
    // "may pull everything in?" — addressed to the owner (whose turn it is)
    expect(g.prompts[0]?.kind).toBe('yesNo')
    expect(g.prompts[0]?.player).toBe(0)
    answer(g, true)

    // the tie is resolved by the OWNER (0), NOT the enemy (1)
    expect(g.prompts[0]?.kind).toBe('chooseSquare')
    expect(g.prompts[0]?.player, 'the opponent is never prompted for their own minion').toBe(0)

    // and the pull actually happens once the owner picks a direction
    answer(g, { x: 2, y: 1 })
    expect(foe.x).toBe(2)
    expect(foe.y).toBe(1)
  })
})

// ── Locusts of Illyria (disabled) ─────────────────────────────────────────────
// A disabled minion loses ALL abilities, including its end-of-turn trigger. This is
// the general "an end-of-turn trigger must not sneak past disable" fix in turn.ts.
describe('a disabled Locust does not spread at end of turn', () => {
  function locustBoard(disabled: boolean): GameState {
    const g = newGame(); keepBoth(g) // player 0 active, turn 1
    placeSite(g, 0, 'Maelström', 3, 2) // a nearby site for the copy to land on
    const locust = summonCard(g, 0, 'Locusts of Illyria', 2, 2)
    if (disabled) locust.disabled = true
    return g
  }
  const count = (g: GameState) => Object.values(g.units).filter((u) => u.name === 'Locusts of Illyria').length

  it('control: an ACTIVE Locust spreads a copy (1 → 2)', () => {
    const g = locustBoard(false)
    act(g, 0, { t: 'endTurn' })
    expect(count(g)).toBe(2)
  })

  it('a DISABLED Locust’s end-of-turn spread does NOT fire (stays at 1)', () => {
    const g = locustBoard(true)
    act(g, 0, { t: 'endTurn' })
    expect(count(g)).toBe(1)
  })
})

// ── Monstermorphosis ──────────────────────────────────────────────────────────
// FAQ: a transform never changes control. Morph an ENEMY minion and it stays under
// the opponent's control, though the new card (from your hand/collection) is owned by
// you, so it goes to YOUR cemetery when it dies.
describe('Monstermorphosis on an enemy minion keeps it under enemy control', () => {
  it('the emerged Monster is controlled by the enemy but owned (card) by the caster', () => {
    const g = newGame(); keepBoth(g)
    const victim = summonCard(g, 1, 'Bone Jumble', 2, 2) // an ENEMY minion (player 1)
    const monsterCardId = injectToHand(g, 0, 'Horrible Hybrids') // a Monster in the caster's hand
    // the resolved Monstermorphosis sits in the caster's cemetery and triggers from there
    const morphCardId = `mm${g.nextId++}`
    g.cards[morphCardId] = { id: morphCardId, name: 'Monstermorphosis', owner: 0 }
    g.players[0].cemetery.push(morphCardId)

    // simulate the cast: disable + schedule the morph for the caster's next turn
    victim.disabled = true
    g.flow = g.flow ?? {}
    g.flow.morphoses = [{ unitId: victim.id, player: 0 as PlayerId, turn: g.turn }]
    g.turn += 2 // the caster's next turn arrives

    getScript('Monstermorphosis')!.startOfTurn!(makeCtx(g, morphCardId, 0, []))
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    answer(g, 'Horrible Hybrids')

    expect(victim.name).toBe('Horrible Hybrids')
    expect(victim.controller, 'control does not change on a transform').toBe(1)
    expect(victim.disabled, 'the chrysalis wakes').toBeFalsy()
    // the new identity uses the caster's hand card → dies to the CASTER's cemetery
    expect(victim.cardId).toBe(monsterCardId)
    expect(g.cards[victim.cardId].owner).toBe(0)
  })
})
