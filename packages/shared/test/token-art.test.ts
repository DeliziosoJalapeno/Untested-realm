// Custom token art: a deck's art for Skeleton / Foot Soldier / Frog (a printing, or an admin-granted
// `custom:<id>`) rides on every token its player creates, and the opponent sees it on the token. Only
// granted arts survive sanitizeCustomArt (what the server runs on each seat's deck at game start).
import { describe, it, expect } from 'vitest'
import {
  createGame, viewFor, starterDecks, summonToken, transformIntoToken, sanitizeCustomArt, customArtSlug, applyJudge, isSafeArtSlug,
  type DeckList, type GameState,
} from '../src'
import '../src/cards/scripts/index'

const SKEL = customArtSlug('art-skel')
const SOLDIER = customArtSlug('art-soldier')

function game(): GameState {
  const deck0: DeckList = { ...(starterDecks[0] as DeckList), art: { Skeleton: SKEL, 'Foot Soldier': SOLDIER } }
  return createGame([deck0, starterDecks[1] as DeckList], ['A', 'B'], 4242)
}

describe('custom token art', () => {
  it('a token carries its creator\'s chosen art, and the opponent sees it', () => {
    const g = game()
    const skel = summonToken(g, 'Skeleton', 0, 2, 1)!
    expect(g.cards[skel.cardId].art).toBe(SKEL)
    expect(viewFor(g, 1).cards[skel.cardId]?.art, 'the opponent sees the token\'s art').toBe(SKEL)
    // the other player's tokens keep the default art
    const theirs = summonToken(g, 'Skeleton', 1, 2, 2)!
    expect(g.cards[theirs.cardId].art).toBeUndefined()
  })

  it('a minion transformed into a token (Degradation\'s Foot Soldier) takes its controller\'s art', () => {
    const g = game()
    const frog = summonToken(g, 'Frog', 0, 1, 1)!
    const soldier = transformIntoToken(g, frog, 'Foot Soldier')!
    expect(g.cards[soldier.cardId].art).toBe(SOLDIER)
  })

  it('an Editor-made token uses its player\'s art too', () => {
    const g = game()
    expect(applyJudge(g, 0, { k: 'summonUnit', name: 'Skeleton', player: 0, x: 3, y: 1 } as any)).toBeNull()
    const u = Object.values(g.units).find((x) => x.name === 'Skeleton')!
    expect(g.cards[u.cardId].art).toBe(SKEL)
  })

  it('the opponent\'s view does not carry the player\'s token-art picks before a token appears', () => {
    const g = game()
    expect(JSON.stringify(viewFor(g, 1))).not.toContain('art-skel')
  })

  it('sanitizeCustomArt keeps only granted arts, only on tokens; printings are untouched', () => {
    const deck = { art: { Skeleton: SKEL, Frog: customArtSlug('art-frog'), Sorcerer: customArtSlug('art-skel'), Deathspeaker: '999-deathspeaker-op-rf' } }
    expect(sanitizeCustomArt(deck, new Set(['art-skel'])).art).toEqual({ Skeleton: SKEL, Deathspeaker: '999-deathspeaker-op-rf' })
    expect(sanitizeCustomArt(deck, new Set()).art).toEqual({ Deathspeaker: '999-deathspeaker-op-rf' })
    expect(sanitizeCustomArt(deck, 'all').art, 'admin: every art, still only on tokens').toEqual({ Skeleton: SKEL, Frog: customArtSlug('art-frog'), Deathspeaker: '999-deathspeaker-op-rf' })
  })

  it('a custom art disguised as a printing path is dropped — only real printings of that card pass', () => {
    const deck = { art: { Skeleton: '../api/token-art/art-skel?', Frog: 'x/../../api/token-art/art-frog#', Deathspeaker: 'made-up-slug', Sorcerer: '999-skeleton-ai-f' } }
    expect(sanitizeCustomArt(deck, new Set()).art).toBeUndefined()
    expect(isSafeArtSlug('../api/token-art/art-skel?')).toBe(false)
    expect(isSafeArtSlug('999-skeleton-ai-f') && isSafeArtSlug(SKEL)).toBe(true)
  })
})
