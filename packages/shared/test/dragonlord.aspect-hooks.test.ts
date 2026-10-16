// Dragonlord taking a Dragon's aspect must gain its PASSIVE/TRIGGERED hooks, not just its activated
// abilities. Two reported bugs:
//  1) Adtonitum's "whenever she stops, may deal 3 damage to another random unit there" is an
//     onUnitEntersSquare trigger (with a yesNo → damage prompt). The Dragonlord never forwarded it,
//     so the aspect did nothing when it moved. Now forwarded, and its continuations resolve through
//     the Dragon's own script (conts Proxy).
//  2) Caelestis has Voidwalk, so a Dragonlord wearing its aspect gains the keyword — but an Avatar
//     can never exist in the void, so it still cannot step into a void square.
import { describe, it, expect } from 'vitest'
import { createGame, starterDecks, applyAction, avatarOf, effKeywords, type GameState, type UnitState } from '../src'
import { isLegalStep } from '../src/engine/movement'
import { makeCtx } from '../src/engine/effects'
import { getScript } from '../src/cards/scripts/registry'
import { summonCard } from './helpers'
import '../src/cards/scripts/index'

/** a started-enough Dragonlord game already wearing `pick`'s aspect this turn. */
function dragonlordWith(pick: string): { g: GameState; avatar: UnitState } {
  const d0: any = { ...starterDecks[0], avatar: 'Dragonlord' }
  const g = createGame([d0, starterDecks[1] as any], ['Drake', 'Foe'], 42, 0)
  applyAction(g, 0, { t: 'prompt', promptId: g.prompts[0]!.id, choice: pick }) // pre-setup set-aside
  g.flow = g.flow ?? {}
  g.flow.dragonForm = { player: 0, turn: g.turn, name: pick } // take the aspect directly (bypass the (3) invoke)
  return { g, avatar: avatarOf(g, 0) }
}

describe('Dragonlord forwards a Dragon aspect’s triggered hooks', () => {
  it('Adtonitum aspect: stopping deals 3 damage to a co-located unit (hook + conts forwarded)', () => {
    const { g, avatar } = dragonlordWith('Adtonitum')
    const foe = summonCard(g, 1, 'Escyllion Cyclops', avatar.x, avatar.y); foe.enteredTurn = -1 // 6/6, survives 3

    const ctx = makeCtx(g, avatar.id, 0, [])
    getScript('Dragonlord')!.onUnitEntersSquare!(ctx, g.units[avatar.id], { x: avatar.x, y: avatar.y, region: 'surface' }, 'move', true)

    const p = g.prompts[0]
    expect(p?.kind, 'Adtonitum’s aspect offered the zap').toBe('yesNo')
    const res = applyAction(g, 0, { t: 'prompt', promptId: p!.id, choice: true }) // yes, unleash it
    expect(res.ok, 'the crackle → zap continuation resolved through the Dragon’s script').toBe(true)
    expect(g.units[foe.id]?.damage ?? 0, 'the co-located unit took 3 damage').toBe(3)
  })

  it('Caelestis aspect: gains Voidwalk but still cannot step into the void (it is an Avatar)', () => {
    const { g, avatar } = dragonlordWith('Caelestis')
    expect(effKeywords(g, g.units[avatar.id]).voidwalk, 'the aspect granted Voidwalk').toBe(true)

    // an orthogonally-adjacent siteless square = a void
    const nx = avatar.x
    const ny = avatar.y === 0 ? 1 : avatar.y - 1
    for (const sid of Object.keys(g.sites)) if (g.sites[sid].x === nx && g.sites[sid].y === ny) delete g.sites[sid]

    const from = { x: avatar.x, y: avatar.y, region: 'surface' as const }
    const to = { x: nx, y: ny, region: 'void' as const }
    expect(isLegalStep(g, g.units[avatar.id], from, to), 'an avatar can’t enter the void even with Voidwalk').toBe(false)
  })
})
