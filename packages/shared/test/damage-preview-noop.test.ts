// The prevention-order prompt must not list a preventer that wouldn't actually reduce THIS hit:
//  • a pure immunity (damagePreviewPure) is dry-run and skipped when it's a no-op (wrong striker), but
//    still offered when it would prevent;
//  • a damageReduction reducer is evaluated and skipped when it returns 0 — e.g. a maskless Imposter,
//    whose forwarded reduction is 0 (this is the "why is Imposter a damage preventer?" fix).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { dealDamageToUnit, type GameState } from '../src'

function barricade(g: GameState, id: string, x: number, y: number) {
  g.cards[id] = { id, name: 'Makeshift Barricade', owner: 0 } as any
  g.artifacts[id] = { id, cardId: id, name: 'Makeshift Barricade', conjuredBy: 0, x, y, region: 'surface', carriedBy: null, tapped: false, counters: {} } as any
}
const hasOrderPrompt = (g: GameState) => g.prompts.some((p) => p.kind === 'orderCards')

describe('prevention-order prompt skips no-op preventers', () => {
  it('a pure immunity that would NOT reduce this hit is not offered', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const templar = summonCard(g, 0, 'Sirian Templar', 2, 2); templar.enteredTurn = -1
    g.units[templar.id].ward = true // a REAL second preventer, so a spurious immunity would make it 2 → prompt
    const attacker = summonCard(g, 1, 'Escyllion Cyclops', 2, 2); attacker.enteredTurn = -1 // NOT Demon/Spirit/Undead

    dealDamageToUnit(g, g.units[templar.id], 2, 1, { source: { player: 1, kind: 'strike', attackerId: attacker.id } })
    // Sirian's immunity is a no-op vs this striker → filtered → only the Ward remains → no order prompt
    expect(hasOrderPrompt(g), 'no spurious order prompt for the inapplicable immunity').toBe(false)
  })

  it('a pure immunity that WOULD prevent is still offered', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const templar = summonCard(g, 0, 'Sirian Templar', 2, 2); templar.enteredTurn = -1
    g.units[templar.id].ward = true
    const undead = summonCard(g, 1, 'Bone Jumble', 2, 2); undead.enteredTurn = -1 // Undead → immunity applies

    dealDamageToUnit(g, g.units[templar.id], 2, 1, { source: { player: 1, kind: 'strike', attackerId: undead.id } })
    const p = g.prompts.find((pp) => pp.kind === 'orderCards')
    expect(p, 'immunity + Ward both apply → the owner orders them').toBeTruthy()
    expect((p!.data as any).cards, 'the Sirian Templar immunity is one of the options').toContain('Sirian Templar')
  })

  it('a maskless Imposter is not offered as a damage reducer (forwarded reduction is 0)', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const av = g.units[g.players[0].avatarUnitId]
    av.name = 'Imposter'; av.x = 2; av.y = 2 // an Imposter avatar wearing no mask → its damageReduction returns 0
    barricade(g, 'b1', 2, 2) // a real preventer sheltering the avatar

    dealDamageToUnit(g, av, 2, 1, { source: { player: 1, kind: 'effect' } })
    // the 0-reduction Imposter is filtered → only the Barricade remains → no order prompt
    expect(hasOrderPrompt(g), 'maskless Imposter is not a preventer here').toBe(false)
  })
})
