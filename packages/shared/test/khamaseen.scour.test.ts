// Khamaseen Mummy surfaces next to a Vast Desert → triggers that Desert's Genesis. Vast Desert's
// Genesis asks its OWN follow-up prompt ("scour"), which must resolve under the DESERT's script, not
// the Mummy's — otherwise it crashes with "No continuation script:Khamaseen Mummy:scour".
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, answer } from './helpers'
import { applyJudge, type GameState, type PlayerId } from '../src'
import { makeCtx } from '../src/engine/effects'
import { getScript } from '../src/cards/scripts/registry'

describe('Khamaseen Mummy → Vast Desert Genesis → scour', () => {
  it('resolves the Desert Genesis follow-up prompt without crashing, and scours a nearby site', () => {
    const g: GameState = newGame(); keepBoth(g)
    const me: PlayerId = 0
    // a Vast Desert on the Mummy's square, and a second site (with a victim minion) one step away
    applyJudge(g, me, { k: 'placeSite', name: 'Vast Desert', player: me, x: 2, y: 1 })
    applyJudge(g, me, { k: 'placeSite', name: 'Accursed Tower', player: me, x: 2, y: 2 })
    applyJudge(g, me, { k: 'summonUnit', name: 'Escyllion Cyclops', player: me, x: 2, y: 2, region: 'surface', noGenesis: true }) // 6/6 — survives 1 dmg
    // the Mummy, freshly surfaced on the Desert's square
    applyJudge(g, me, { k: 'summonUnit', name: 'Khamaseen Mummy', player: me, x: 2, y: 1, region: 'surface', noGenesis: true })

    const mummy = Object.values(g.units).find((u) => u.name === 'Khamaseen Mummy')!
    const victim = Object.values(g.units).find((u) => u.name === 'Escyllion Cyclops')!
    const dmg0 = victim.damage ?? 0

    // fire the unburrow trigger as the engine would (from underground → its current surface square)
    const script = getScript('Khamaseen Mummy')!
    const ctx = makeCtx(g, mummy.id, me, [])
    expect(() => script.onUnitEntersSquare!(ctx, mummy, { x: 2, y: 1, region: 'underground' })).not.toThrow()

    // one nearby Desert → a yes/no "trigger its Genesis?" prompt. Say yes.
    expect(g.prompts[0]?.kind).toBe('yesNo')
    answer(g, true)

    // Vast Desert's Genesis now asks WHICH nearby site to scour (cont 'scour', owned by Vast Desert).
    // Before the fix this prompt was filed as script:Khamaseen Mummy:scour and threw on resolution.
    expect(g.prompts[0]?.kind).toBe('chooseSquare')
    expect(() => answer(g, { x: 2, y: 2 })).not.toThrow()

    // the scour dealt its 1 damage to the minion atop the chosen site
    const after = Object.values(g.units).find((u) => u.name === 'Escyllion Cyclops')!
    expect(after.damage ?? 0).toBe(dmg0 + 1)
  })
})
