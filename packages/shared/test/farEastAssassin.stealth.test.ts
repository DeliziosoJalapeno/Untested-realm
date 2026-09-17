import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, giveArtifact, act, answer } from './helpers'
import { getCard } from '../src'

// FAQ (Far East Assassin): "Does the Assassin lose Stealth if it uses its ability? Yes. It's an
// activated special ability, so Stealth is lost per the normal Stealth rules." Using ANY activated
// ability interacts with the realm and reveals a Stealthed unit — implemented centrally in
// activateAbility, the same way casting a spell breaks Stealth.
describe('Stealth is lost when a unit activates an ability', () => {
  it('Far East Assassin loses Stealth when it throws an artifact', () => {
    const g: any = newGame(); keepBoth(g)
    const assassin = summonCard(g, 0, 'Far East Assassin', 2, 2)
    assassin.enteredTurn = -1; assassin.tapped = false; assassin.stealth = true
    const core = giveArtifact(g, assassin, 'Amethyst Core')
    const foe = summonCard(g, 1, 'Stygian Archers', 2, 3) // adjacent enemy
    foe.enteredTurn = -1

    act(g, 0, { t: 'activate', sourceId: assassin.id, ability: 'throw', targets: [foe.id] })
    // Stealth is spent the moment the ability is used — before the throw even resolves.
    expect(g.units[assassin.id].stealth ?? false, 'the Assassin is revealed by using its ability').toBe(false)
    expect(g.units[assassin.id].tapped, 'and tapped for the ability').toBe(true)

    // finish the throw: pick the carried artifact → it hits the foe for its mana cost
    if (g.prompts.length) answer(g, 'Amethyst Core')
    expect(g.units[foe.id]?.damage, 'the thrown Core deals its mana cost').toBe(getCard('Amethyst Core').cost ?? 0)
    expect(g.units[assassin.id].carrying.includes(core.id), 'the Core is no longer carried').toBe(false)
  })

  it('a Stealthed unit that does NOT act keeps its Stealth', () => {
    const g: any = newGame(); keepBoth(g)
    const assassin = summonCard(g, 0, 'Far East Assassin', 2, 2)
    assassin.enteredTurn = -1; assassin.stealth = true
    expect(g.units[assassin.id].stealth).toBe(true)
  })
})
