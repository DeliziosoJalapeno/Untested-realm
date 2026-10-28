// Gift of the Raven: "Choose an allied minion. The next time they strike a unit this turn, the
// damage heals you." The heal belongs to the CHOSEN minion's next strike, not whichever ally
// strikes first.
import { describe, it, expect } from 'vitest'
import { newGame, act, keepBoth, fetchToHand, answer, castMagic, settlePrompts, summonCard, waiveThreshold } from './helpers'
import { avatarOf, summonToken } from '../src'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame()
  keepBoth(g)
  const v1 = fetchToHand(g, 0, 'Rustic Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
  if (g.prompts.length) answer(g, false)
  avatarOf(g, 0).tapped = false
  const v2 = fetchToHand(g, 0, 'Simple Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v2, x: 3, y: 0 })
  if (g.prompts.length) answer(g, false)
  return g
}

describe('Gift of the Raven heals on the chosen minion\'s strike', () => {
  it('another ally striking first does not use up the heal', () => {
    const g = board()
    const other = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    const chosen = summonToken(g, 'Foot Soldier', 0, 3, 0)!
    other.enteredTurn = 0; chosen.enteredTurn = 0
    const wallA = summonCard(g, 1, 'Bane of Aventis', 2, 0)
    const wallB = summonCard(g, 1, 'Bane of Aventis', 3, 0)
    const avatar = avatarOf(g, 0)
    avatar.life = 10
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Gift of the Raven', { targets: [chosen.id] })
    settlePrompts(g)

    act(g, 0, { t: 'moveAttack', unitId: other.id, path: [], attack: { unit: wallA.id } })
    settlePrompts(g)
    expect(avatar.life, 'the unchosen ally\'s strike heals nothing').toBe(10)

    act(g, 0, { t: 'moveAttack', unitId: chosen.id, path: [], attack: { unit: wallB.id } })
    settlePrompts(g)
    expect(avatar.life, 'the chosen minion\'s strike heals for its damage').toBe(11)
  })
})
