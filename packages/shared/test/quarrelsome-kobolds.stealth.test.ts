// Quarrelsome Kobolds' end-of-turn strike is a TARGETED ability ("another target adjacent unit"),
// so it must not be able to choose a Stealthed ENEMY minion. Its own Stealthed minions, and the
// Kobolds itself, remain valid choices.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { makeCtx, getScript } from '../src'

function candidates(g: any, kobId: string): string[] {
  const ctx: any = makeCtx(g, kobId, 0, [])
  let caught: string[] = []
  ctx.ask = (prompt: any) => { caught = prompt.data?.candidates ?? [] }
  getScript('Quarrelsome Kobolds')!.endOfTurn!(ctx)
  return caught
}

describe('Quarrelsome Kobolds targeting respects Stealth', () => {
  it('excludes a Stealthed enemy but keeps a visible enemy and itself', () => {
    const g: any = newGame(); keepBoth(g)
    const kob = summonCard(g, 0, 'Quarrelsome Kobolds', 2, 2); kob.enteredTurn = -1
    const hidden = summonCard(g, 1, 'Foot Soldier', 2, 1); hidden.enteredTurn = -1; hidden.stealth = true
    const visible = summonCard(g, 1, 'Foot Soldier', 3, 2); visible.enteredTurn = -1

    const c = candidates(g, kob.id)
    expect(c, 'Stealthed enemy is NOT targetable').not.toContain(hidden.id)
    expect(c, 'visible adjacent enemy IS targetable').toContain(visible.id)
    expect(c, 'the Kobolds can always strike itself').toContain(kob.id)
  })

  it('a Stealthed FRIENDLY minion stays valid (Stealth only hides from opponents)', () => {
    const g: any = newGame(); keepBoth(g)
    const kob = summonCard(g, 0, 'Quarrelsome Kobolds', 2, 2); kob.enteredTurn = -1
    const ally = summonCard(g, 0, 'Foot Soldier', 2, 1); ally.enteredTurn = -1; ally.stealth = true

    const c = candidates(g, kob.id)
    expect(c, 'your own Stealthed minion is still a legal target').toContain(ally.id)
  })

  it('with only a Stealthed enemy adjacent, the Kobolds is still offered (never soft-locks)', () => {
    const g: any = newGame(); keepBoth(g)
    const kob = summonCard(g, 0, 'Quarrelsome Kobolds', 2, 2); kob.enteredTurn = -1
    const hidden = summonCard(g, 1, 'Foot Soldier', 2, 1); hidden.enteredTurn = -1; hidden.stealth = true

    const c = candidates(g, kob.id)
    expect(c, 'self is always an option — the ability never soft-locks').toContain(kob.id)
    expect(c, 'the lone Stealthed enemy is still excluded').not.toContain(hidden.id)
  })
})
