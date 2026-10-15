// Key to the City: "Bearer ignores site abilities." The October 2026 codex frames this as the
// bearer being Protected from Sites (Protected from X): no site ability may target, damage, destroy,
// banish, modify, move or impede it. So a Key-bearer dragged onto a Bottomless Pit ("kill any
// non-Airborne minion that enters") simply shrugs it off — while an identical minion without the Key
// tumbles in.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact } from './helpers'
import { makeCtx, checkStateBased } from '../src'
import '../src/cards/scripts/index'

describe('Key to the City — bearer is Protected from Sites', () => {
  it('a Key-bearer dragged onto a Bottomless Pit survives the site ability', () => {
    const g = newGame(42, 0); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Bottomless Pit', 2, 1)
    const bearer = summonCard(g, 1, 'Stygian Archers', 4, 3); bearer.enteredTurn = -1 // 3/3, non-Airborne
    giveArtifact(g, bearer, 'Key to the City')

    makeCtx(g, bearer.id, 1, []).teleport(bearer.id, 2, 1, 'surface')
    checkStateBased(g)

    expect(g.units[bearer.id], 'the Key bearer ignores the Pit and lives').toBeTruthy()
  })

  it('control: the same minion WITHOUT the Key falls into the Pit', () => {
    const g = newGame(42, 0); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Bottomless Pit', 2, 1)
    const victim = summonCard(g, 1, 'Stygian Archers', 4, 3); victim.enteredTurn = -1

    makeCtx(g, victim.id, 1, []).teleport(victim.id, 2, 1, 'surface')
    checkStateBased(g)

    expect(g.units[victim.id], 'with no protection, the Pit claims it').toBeFalsy()
  })
})
