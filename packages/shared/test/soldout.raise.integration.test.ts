// REAL end-to-end test (the earlier one only poked the trigger by hand): actually ACTIVATE the
// Bone Jumble / Fowl Bones from-cemetery raise, sacrificing a Skeleton that stands on a Sold-out
// Cemetery, and drive every resulting prompt to completion. This is the flow that was reported to
// "break the game" — it must resolve with no leftover / unanswerable prompt and no crash.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveMana } from './helpers'
import { grantedAbilities, applyAction, type GameState } from '../src'
import '../src/cards/scripts/index'

function cemeteryCard(g: GameState, player: 0 | 1, name: string): string {
  const id = `cc${g.nextId++}`
  ;(g.cards as any)[id] = { id, name, owner: player }
  g.players[player].cemetery.push(id)
  return id
}

// answer every open prompt with a legal choice until none remain (or a cap → soft-lock)
function drivePrompts(g: GameState, cap = 20): number {
  let n = 0
  while (g.prompts.length && n < cap) {
    const p = g.prompts[0]
    const d: any = p.data
    const choice = p.kind === 'chooseTargets' ? [d.candidates[0]]
      : p.kind === 'chooseSquare' ? d.squares[0]
      : p.kind === 'chooseOption' ? d.options[0]
      : p.kind === 'yesNo' ? true : undefined
    const r = applyAction(g, p.player, { t: 'prompt', promptId: p.id, choice } as any)
    expect(r.ok, r.ok ? '' : `prompt "${p.title}" rejected: ${(r as any).error}`).toBe(true)
    n++
  }
  return n
}

describe('Fowl Bones / Bone Jumble raise onto a Sold-out Cemetery resolves (no soft-lock)', () => {
  for (const card of ['Bone Jumble', 'Fowl Bones'] as const) {
    it(`${card}: sacrifice a Skeleton on the cemetery, raise it, push the other Undead — clean`, () => {
      const g = newGame() as GameState; keepBoth(g); giveMana(g, 0, 9)
      placeSite(g, 0, 'Sold-out Cemetery', 2, 2)
      placeSite(g, 0, 'Rustic Village', 3, 2)
      placeSite(g, 0, 'Rustic Village', 2, 3)
      summonCard(g, 0, 'Skeleton', 2, 2).enteredTurn = -1 // to sacrifice
      summonCard(g, 0, 'Skeleton', 2, 2).enteredTurn = -1 // the other Undead, pushed by Sold-out
      const raiser = cemeteryCard(g, 0, card)

      const avatar = g.units[g.players[0].avatarUnitId]
      const ab = grantedAbilities(g, avatar).find((a) => a.key === `boneRaise:${raiser}`)!
      const res = applyAction(g, 0, { t: 'activate', sourceId: avatar.id, ability: ab.key } as any)
      expect(res.ok, res.ok ? '' : (res as any).error).toBe(true)

      const steps = drivePrompts(g)
      expect(steps, 'did not hit the prompt cap → no soft-lock').toBeLessThan(20)
      expect(g.prompts.length, 'no leftover / unanswerable prompt').toBe(0)
      expect(Object.values(g.units).some((u) => u.name === card), `${card} rose from the grave`).toBe(true)
      // the sacrificed Skeleton is gone; the other Undead was pushed off the cemetery onto an adjacent site
      expect(Object.values(g.units).filter((u) => u.name === 'Skeleton').length, 'one Skeleton sacrificed, one pushed away').toBe(1)
      const pushed = Object.values(g.units).find((u) => u.name === 'Skeleton')!
      expect(pushed.x === 2 && pushed.y === 2, 'the surviving Skeleton no longer shares the cemetery').toBe(false)
    })
  }

  // The GUI path: click the Skeleton token itself (the `bones:` grant) with the Skeleton being the ONLY
  // Undead on the cemetery. Its cost sacrificed the Skeleton AFTER the effect, so the raised bone-raiser
  // entered while the Skeleton was still a live Undead here → Sold-out offered the (about-to-be-sacrificed)
  // Skeleton as the sole MANDATORY push target, which then vanished → an unanswerable prompt. This is the
  // reported "prompts to move a no-longer-existing sacrificed minion" soft-lock.
  for (const card of ['Bone Jumble', 'Fowl Bones'] as const) {
    it(`${card}: clicking the ONLY Skeleton (token grant) never offers the sacrificed Skeleton`, () => {
      const g = newGame() as GameState; keepBoth(g); giveMana(g, 0, 9)
      placeSite(g, 0, 'Sold-out Cemetery', 2, 2)
      placeSite(g, 0, 'Rustic Village', 3, 2)
      const sk = summonCard(g, 0, 'Skeleton', 2, 2); sk.enteredTurn = -1 // the ONLY Skeleton
      const raiser = cemeteryCard(g, 0, card)

      const ab = grantedAbilities(g, g.units[sk.id]).find((a) => a.key === `bones:${raiser}`)!
      const res = applyAction(g, 0, { t: 'activate', sourceId: sk.id, ability: ab.key } as any)
      expect(res.ok, res.ok ? '' : (res as any).error).toBe(true)
      // no open prompt may offer a candidate that isn't on the board (that's the soft-lock)
      for (const p of g.prompts) for (const id of (p.data as any)?.candidates ?? []) {
        expect(g.units[id], `prompt "${p.title}" must only offer live units`).toBeTruthy()
      }
      const steps = drivePrompts(g)
      expect(steps, 'no prompt loop / soft-lock').toBeLessThan(20)
      expect(g.prompts.length).toBe(0)
      expect(Object.values(g.units).some((u) => u.name === card), `${card} rose`).toBe(true)
      expect(g.units[sk.id], 'the Skeleton was sacrificed').toBeUndefined()
    })
  }

  // NB: there is intentionally NO "loop guard" test — Sold-out Cemetery has no once-per-turn limit, so
  // two adjacent ones may legally shuffle an Undead back and forth as long as the player keeps choosing
  // that direction (each push is its own prompt). That's a clock cost, not an engine bug, so it isn't
  // capped or asserted here.
})
