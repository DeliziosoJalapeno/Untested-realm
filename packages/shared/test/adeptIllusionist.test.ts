// Adept Illusionist: "Tap → summon another Adept Illusionist NEARBY." The copy used to
// auto-spawn on the caster's own square; now the controller chooses which nearby site (their
// own square included) when more than one is available.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, injectToHand, placeSite, act } from './helpers'
import { applyAction, type GameState } from '../src'
import '../src/cards/scripts/index'

const illusionistsAt = (g: GameState, x: number, y: number) =>
  Object.values(g.units).filter((u) => u.name === 'Adept Illusionist' && u.x === x && u.y === y)

describe('Adept Illusionist — choose where the copy spawns', () => {
  it('with 2+ nearby sites, prompts for a square and summons the copy there (not on the caster)', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 1, 1) // under the caster
    placeSite(g, 0, 'Rustic Village', 2, 1) // a nearby site
    placeSite(g, 0, 'Rustic Village', 1, 2) // another nearby site
    const caster = summonCard(g, 0, 'Adept Illusionist', 1, 1)
    injectToHand(g, 0, 'Adept Illusionist')

    act(g, 0, { t: 'activate', sourceId: caster.id, ability: 'mirror' })
    const pr = g.prompts[0]
    expect(pr?.kind, 'a nearby-site choice appears').toBe('chooseSquare')
    const squares = (pr!.data as any).squares as { x: number; y: number }[]
    expect(squares.some((s) => s.x === 2 && s.y === 1), 'offers the non-self nearby site').toBe(true)

    applyAction(g, pr!.player, { t: 'prompt', promptId: pr!.id, choice: { x: 2, y: 1 } }) // NOT the caster's square

    expect(illusionistsAt(g, 2, 1).length, 'copy summoned at the chosen square').toBe(1)
    expect(illusionistsAt(g, 1, 1).length, 'only the caster remains on its own square').toBe(1)
    expect(caster.tapped, 'the tap cost was paid').toBe(true)
    expect(g.players[0].hand.some((id) => g.cards[id].name === 'Adept Illusionist'), 'the hand copy was consumed').toBe(false)
  })

  it('with only one nearby site, summons immediately without a prompt', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 1, 1) // the ONLY nearby site (under the caster)
    const caster = summonCard(g, 0, 'Adept Illusionist', 1, 1)
    injectToHand(g, 0, 'Adept Illusionist')

    act(g, 0, { t: 'activate', sourceId: caster.id, ability: 'mirror' })
    expect(g.prompts.length, 'no prompt when there is only one option').toBe(0)
    expect(illusionistsAt(g, 1, 1).length, 'caster + auto-summoned copy share the only site').toBe(2)
  })
})
