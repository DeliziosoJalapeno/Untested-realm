// "Avatars in the void have a mandatory action" (Codex/Kairos FAQ): an ESTABLISHED avatar that is
// stranded on a siteless (void) square — its site banished / moved out from under it (Roots of
// Yggdrasil, Kairos…) — must play a site from hand beneath itself at the start of its turn. This
// reuses the turn-1 first-site establishment flow, gated on p.established so a never-established
// (pre-establishment / bare fixture) avatar is NOT nagged.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, answer, injectToHand, placeSite } from './helpers'
import { beginTurn, siteAt } from '../src'

const drainDraw = (g: any) => { if (g.prompts[0]?.kind === 'drawDeck') answer(g, 'spellbook') }
const firstSitePrompt = (g: any) => g.prompts.find((p: any) => p.kind === 'firstSite')

describe('avatar stranded in the void — mandatory site play', () => {
  it('an established avatar in the void must establish a site under itself', () => {
    const g: any = newGame(); keepBoth(g)
    const p0 = g.players[0]
    const av = g.units[p0.avatarUnitId]
    p0.established = true          // it had a domain...
    av.x = 1; av.y = 1            // ...but a banished site left it here — the void (no site at 1,1)
    const siteId = injectToHand(g, 0, 'Rustic Village')

    beginTurn(g, 0); drainDraw(g)
    expect(firstSitePrompt(g), 'the stranded avatar is forced to play a site').toBeTruthy()
    answer(g, siteId)
    expect(siteAt(g, 1, 1), 'a site now sits under the avatar — no longer in the void').toBeTruthy()
  })

  it('establishes under the avatar even when its domain lies far away', () => {
    // The case above leaves the player with no other sites, so the ordinary placement rule
    // happens to offer the avatar's own square anyway and the mandatory action completes by
    // luck. Give that player a domain in the far corner and the rule — "adjacent to a site you
    // control" — refuses the very square the avatar is stranded on, and the action it is
    // REQUIRED to take becomes impossible: the prompt is answered, nothing is placed, and the
    // avatar stays in the void for the rest of the game.
    const g: any = newGame(); keepBoth(g)
    const p0 = g.players[0]
    const av = g.units[p0.avatarUnitId]
    p0.established = true
    av.x = 0; av.y = 0                        // stranded here...
    placeSite(g, 0, 'Rustic Village', 4, 3)   // ...with its only site nowhere near it
    const siteId = injectToHand(g, 0, 'Rustic Village')

    beginTurn(g, 0); drainDraw(g)
    expect(firstSitePrompt(g), 'still forced to play a site').toBeTruthy()
    answer(g, siteId)
    expect(siteAt(g, 0, 0), 'the forced placement lands under the avatar regardless').toBeTruthy()
  })

  it('an established avatar standing on a site is NOT nagged', () => {
    const g: any = newGame(); keepBoth(g)
    const p0 = g.players[0]
    const av = g.units[p0.avatarUnitId]
    p0.established = true
    placeSite(g, 0, 'Rustic Village', av.x, av.y) // on a site → not in the void
    injectToHand(g, 0, 'Rustic Village')

    beginTurn(g, 0); drainDraw(g)
    expect(firstSitePrompt(g), 'no mandatory action while safely on a site').toBeUndefined()
  })

  it('a never-established avatar on a bare square is NOT nagged (pre-establishment)', () => {
    const g: any = newGame(); keepBoth(g) // established stays false
    const p0 = g.players[0]
    const av = g.units[p0.avatarUnitId]
    av.x = 1; av.y = 1 // siteless, but the avatar never established → not "stranded"
    injectToHand(g, 0, 'Rustic Village')

    beginTurn(g, 0); drainDraw(g)
    expect(firstSitePrompt(g), 'pre-establishment avatars are exempt').toBeUndefined()
  })
})
