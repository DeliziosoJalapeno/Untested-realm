import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'

// Redcap Powries: "If Redcap Powries haven't attacked by the end of your turn, they die."
// Attacking counts whether the target is a MINION or a SITE. A previous bug: an UNDEFENDED
// site strike returned before firing the afterAttack hook, so "attackedTurn" was never
// recorded and the Powries wrongly killed themselves at end of turn.

describe('Redcap Powries count a SITE attack as having attacked', () => {
  it('survives the end of turn after striking an (undefended) enemy site', () => {
    const g = newGame(); keepBoth(g)
    const enemySite = placeSite(g, 1, 'Spire', 2, 2) // player 1's site
    const redcap = summonCard(g, 0, 'Redcap Powries', 2, 2, 'surface') // standing on it
    redcap.enteredTurn = 0

    act(g, 0, { t: 'moveAttack', unitId: redcap.id, path: [], attack: { site: enemySite.id } })
    while (g.prompts.length) answer(g, 0) // no defenders → auto-resolves
    expect(redcap.counters?.attackedTurn, 'the site strike recorded "attacked this turn"').toBe(g.turn)

    act(g, 0, { t: 'endTurn' })
    while (g.prompts.length) answer(g, 0)
    expect(g.units[redcap.id], 'Redcap Powries live on after attacking a site').toBeTruthy()
  })

  it('still dies at end of turn if it does NOT attack at all', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const redcap = summonCard(g, 0, 'Redcap Powries', 2, 2, 'surface')
    redcap.enteredTurn = 0

    act(g, 0, { t: 'endTurn' })
    while (g.prompts.length) answer(g, 0)
    expect(g.units[redcap.id], 'idle Redcap Powries turn on themselves').toBeUndefined()
  })
})
