import { describe, it, expect } from 'vitest'
import { createGame, starterDecks, applyAction, cinject, avatarOf, getCard } from '../src'

/** a REAL game (not the newGame() helper, which opts out) enforces the first-turn site. */
function realGame(first: 0 | 1 = 0) {
  return createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 42, first)
}

/** advance a firstSite prompt for `player`, first clearing any drawDeck prompt. */
function answerFirstSite(g: ReturnType<typeof realGame>, player: 0 | 1, cardId: string) {
  if (g.prompts[0]?.kind === 'drawDeck') applyAction(g, player, { t: 'prompt', promptId: g.prompts[0].id, choice: 'spellbook' })
  const pr = g.prompts[0]
  expect(pr?.kind, `player ${player} is forced to play a first site`).toBe('firstSite')
  expect(pr?.player).toBe(player)
  expect(g.phase).not.toBe('main')
  applyAction(g, player, { t: 'prompt', promptId: pr!.id, choice: cardId })
}

describe('forced first-turn site', () => {
  it('the first player must place a site under the avatar before the main phase', () => {
    const g = realGame(0)
    const spire = cinject(g, 0, 'Spire') // a genesis-free site
    applyAction(g, 0, { t: 'keepHand' })
    applyAction(g, 1, { t: 'keepHand' })

    const pr = g.prompts[0]
    expect(pr?.kind).toBe('firstSite')
    expect(pr?.player).toBe(0)
    expect(g.phase).not.toBe('main')
    for (const id of pr!.data.ids as string[]) expect(getCard(g.cards[id].name).type).toBe('Site')

    const avatar = avatarOf(g, 0)
    const manaBefore = g.players[0].mana
    applyAction(g, 0, { t: 'prompt', promptId: pr!.id, choice: spire })

    const site = Object.values(g.sites).find((s) => s.x === avatar.x && s.y === avatar.y && !s.isRubble)
    expect(site?.name).toBe('Spire')
    expect(g.players[0].mana).toBeGreaterThan(manaBefore) // site-entry mana
    expect(g.phase).toBe('main')
    expect(g.prompts.length).toBe(0)
    expect(g.players[0].firstSiteDone).toBe(true)
    // establishing the domain uses the Avatar's "Tap → play a site" ability:
    // the avatar is now tapped and can't move/attack for the rest of turn 1.
    expect(avatar.tapped).toBe(true)
  })

  it("triggers the placed site's Genesis (Rustic Village asks to summon a Foot Soldier)", () => {
    const g = realGame(0)
    const village = cinject(g, 0, 'Rustic Village')
    g.players[0].mana = Math.max(g.players[0].mana, 1) // ensure the Genesis' pay-① option is offered
    applyAction(g, 0, { t: 'keepHand' })
    applyAction(g, 1, { t: 'keepHand' })
    applyAction(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: village })
    // the site's Genesis fired: its yesNo prompt is now pending for player 0
    const gen = g.prompts[0]
    expect(gen?.player).toBe(0)
    expect(gen?.kind).toBe('yesNo')
    expect(gen?.title).toMatch(/Foot Soldier/i)
  })

  it('forces the SECOND player too, on their own first turn', () => {
    const g = realGame(0)
    const s0 = cinject(g, 0, 'Spire')
    const s1 = cinject(g, 1, 'Spire')
    applyAction(g, 0, { t: 'keepHand' })
    applyAction(g, 1, { t: 'keepHand' })

    answerFirstSite(g, 0, s0) // player 0's forced site
    expect(g.phase).toBe('main')
    applyAction(g, 0, { t: 'endTurn' }) // hand over to player 1

    answerFirstSite(g, 1, s1) // player 1 is forced too (after their draw)
    const av1 = avatarOf(g, 1)
    const site1 = Object.values(g.sites).find((s) => s.x === av1.x && s.y === av1.y && !s.isRubble)
    expect(site1?.name).toBe('Spire')
    expect(g.phase).toBe('main')
    expect(g.players[1].firstSiteDone).toBe(true)
  })

  it('a player with no site in hand is not blocked (rule cannot be satisfied)', () => {
    const g = realGame(0)
    g.players[0].hand = g.players[0].hand.filter((id) => getCard(g.cards[id].name).type !== 'Site')
    applyAction(g, 0, { t: 'keepHand' })
    applyAction(g, 1, { t: 'keepHand' })
    expect(g.prompts[0]?.kind).not.toBe('firstSite')
    expect(g.phase).toBe('main')
    expect(g.players[0].firstSiteDone).toBe(true)
  })
})
