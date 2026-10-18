// Deck-order knowledge (engine/knowledge.ts): effects that show a player cards at an end of a deck
// record them; reads are validated against the live deck, so draws shorten a known run while an
// unseen disturbance drops it. The bot reads this to play with exactly what a player would know.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, answer, act, injectToHand, summonCard, castMagic, waiveThreshold, fetchToHand } from './helpers'
import { avatarOf, getScript, makeCtx, knownCards, noteKnownCards, noteAddedToEnd, shuffleDeck, playSite, returnToDeck, drawCards, type GameState } from '../src'

/** mid-game board: p0 owns a site at (2,0), fresh main phase */
function board(): GameState {
  const g = newGame()
  keepBoth(g)
  const v1 = fetchToHand(g, 0, 'Rustic Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
  if (g.prompts.length) answer(g, false)
  avatarOf(g, 0).tapped = false
  return g
}

describe('knownCards validation', () => {
  it('a draw off the top shortens the top run; the bottom run survives top draws', () => {
    const g = newGame(); keepBoth(g)
    const sb = g.players[0].spellbook
    const [a, b, c] = sb.slice(0, 3)
    const bottom = sb.slice(-2)
    noteKnownCards(g, 0, 0, 'spellbook', 'top', [a, b, c])
    noteKnownCards(g, 0, 0, 'spellbook', 'bottom', bottom)
    expect(knownCards(g, 0, 0, 'spellbook', 'top')).toEqual([a, b, c])
    expect(knownCards(g, 1, 0, 'spellbook', 'top'), 'the other player knows nothing').toEqual([])
    drawCards(g, 0, 'spellbook', 1)
    expect(knownCards(g, 0, 0, 'spellbook', 'top')).toEqual([b, c])
    expect(knownCards(g, 0, 0, 'spellbook', 'bottom')).toEqual(bottom)
  })

  it('a shuffle or an unseen card put on top drops the run', () => {
    const g = newGame(); keepBoth(g)
    const sb = g.players[0].spellbook
    noteKnownCards(g, 0, 0, 'spellbook', 'top', sb.slice(0, 2))
    const hidden = g.players[0].hand[0]
    g.players[0].hand.shift()
    sb.unshift(hidden)
    expect(knownCards(g, 0, 0, 'spellbook', 'top'), 'unseen card on top').toEqual([])

    const g2 = newGame(); keepBoth(g2)
    const sb2 = g2.players[0].spellbook
    noteKnownCards(g2, 0, 0, 'spellbook', 'top', sb2.slice(0, 3))
    sb2.reverse() // stand-in for a shuffle
    expect(knownCards(g2, 0, 0, 'spellbook', 'top')).toEqual([])
  })
})

describe('Seer / Second Seer', () => {
  const seerPeek = (g: GameState, pick: 'keep on top' | 'put on bottom') => {
    const seer = summonCard(g, 0, 'Seer', 2, 2)
    getScript('Seer')!.startOfTurn!(makeCtx(g, seer.id, 0, []))
    answer(g, 'peek at topmost spell')
    answer(g, pick)
  }

  it('Seer keep → the top card is known on top', () => {
    const g = newGame(); keepBoth(g)
    const top = g.players[0].spellbook[0]
    seerPeek(g, 'keep on top')
    expect(knownCards(g, 0, 0, 'spellbook', 'top')).toEqual([top])
    expect(knownCards(g, 1, 0, 'spellbook', 'top')).toEqual([])
  })

  it('Seer bottom → the card is known at the very bottom', () => {
    const g = newGame(); keepBoth(g)
    const top = g.players[0].spellbook[0]
    seerPeek(g, 'put on bottom')
    expect(g.players[0].spellbook.at(-1)).toBe(top)
    expect(knownCards(g, 0, 0, 'spellbook', 'bottom')).toEqual([top])
    expect(knownCards(g, 0, 0, 'spellbook', 'top')).toEqual([])
  })

  it('Second Seer keep vs bottom', () => {
    const g = newGame(0, 0)
    g.flow = g.flow ?? {}
    g.flow.secondSeer = true
    keepBoth(g)
    const top = g.players[1].spellbook[0]
    answer(g, 'peek at topmost spell')
    answer(g, 'put on bottom')
    expect(knownCards(g, 1, 1, 'spellbook', 'bottom')).toEqual([top])

    const g2 = newGame(0, 0)
    g2.flow = g2.flow ?? {}
    g2.flow.secondSeer = true
    keepBoth(g2)
    const top2 = g2.players[1].atlas[0]
    answer(g2, 'peek at topmost site')
    answer(g2, 'keep on top')
    expect(knownCards(g2, 1, 1, 'atlas', 'top')).toEqual([top2])
  })
})

describe('Observatory (askOrder)', () => {
  it('records the chosen top order', () => {
    const g = board()
    const [a, b, c] = g.players[0].spellbook.slice(0, 3)
    const obs = injectToHand(g, 0, 'Observatory')
    expect(playSite(g, 0, obs, 1, 0)).toBeNull()
    answer(g, [2, 0, 1])
    expect(knownCards(g, 0, 0, 'spellbook', 'top')).toEqual([c, a, b])
    expect(knownCards(g, 1, 0, 'spellbook', 'top')).toEqual([])
  })
})

describe('public reveals give both players knowledge', () => {
  it('Lilith: a buried non-minion is known at the bottom of the opponent deck by both', () => {
    const g = newGame(); keepBoth(g)
    const lil = summonCard(g, 0, 'Lilith', 2, 2); lil.enteredTurn = -1
    const oppTop = g.players[1].spellbook[0]
    g.cards[oppTop].name = 'Common Sense'
    getScript('Lilith')!.endOfTurn!(makeCtx(g, lil.id, 0, []))
    expect(knownCards(g, 0, 1, 'spellbook', 'bottom')).toEqual([oppTop])
    expect(knownCards(g, 1, 1, 'spellbook', 'bottom')).toEqual([oppTop])
  })

  it('Black Mass: the leftovers are a bottom run known to the caster only (a search is private)', () => {
    const g: any = newGame(); keepBoth(g)
    waiveThreshold(g, 0)
    const top7 = g.players[0].spellbook.slice(0, 7)
    for (const id of top7) g.cards[id].name = 'Common Sense' // no Evil minions → all go straight back
    castMagic(g, 0, 'Black Mass')
    // FAQ: the caster chooses the order — picked starting from the very bottom
    expect(g.prompts[0]?.kind).toBe('orderCards')
    answer(g, [0, 1, 2, 3, 4, 5, 6])
    const placed = [...top7].reverse() // first pick (top7[0]) is the very bottom
    expect(g.players[0].spellbook.slice(-7)).toEqual(placed)
    expect(knownCards(g, 0, 0, 'spellbook', 'bottom')).toEqual(placed)
    expect(knownCards(g, 1, 0, 'spellbook', 'bottom')).toEqual([])
    expect(g.log.some((e: any) => top7.some((id: string) => e.msg.includes(g.cards[id].name))), 'the log names none of them').toBe(false)
  })
})

describe('mulligan and returnToDeck', () => {
  it('mulliganed cards are a known bottom run for that player', () => {
    const g = newGame()
    const back = g.players[0].hand.slice(0, 3)
    act(g, 0, { t: 'mulligan', back } as any)
    const sb = g.players[0].spellbook
    const atlas = g.players[0].atlas
    const inSb = back.filter((id) => sb.includes(id))
    const inAtlas = back.filter((id) => atlas.includes(id))
    expect(inSb.length + inAtlas.length).toBe(3)
    expect(knownCards(g, 0, 0, 'spellbook', 'bottom')).toEqual(inSb)
    expect(knownCards(g, 0, 0, 'atlas', 'bottom')).toEqual(inAtlas)
    expect(knownCards(g, 1, 0, 'spellbook', 'bottom')).toEqual([])
  })

  it('returnToDeck extends an already-known bottom run, for both players', () => {
    const g = newGame(); keepBoth(g)
    const sb = g.players[0].spellbook
    const known = sb.slice(-2)
    noteKnownCards(g, 0, 0, 'spellbook', 'bottom', known)
    const id = `x${g.nextId++}`
    g.cards[id] = { id, name: 'Bone Jumble', owner: 0 }
    returnToDeck(g, id)
    expect(knownCards(g, 0, 0, 'spellbook', 'bottom')).toEqual([...known, id])
    expect(knownCards(g, 1, 0, 'spellbook', 'bottom'), 'the opponent only saw the returned card').toEqual([id])
  })
})

describe('knowledge is forgotten when it can no longer be trusted', () => {
  it('a shuffle forgets every known run of that deck, even if a card happens to stay put', () => {
    const g = newGame()
    const sb = g.players[0].spellbook
    noteKnownCards(g, 'both', 0, 'spellbook', 'top', [sb[0]])
    noteKnownCards(g, 0, 0, 'spellbook', 'bottom', [sb[sb.length - 1]])
    noteKnownCards(g, 0, 0, 'atlas', 'top', [g.players[0].atlas[0]])
    shuffleDeck(g, 0, 'spellbook')
    expect(knownCards(g, 0, 0, 'spellbook', 'top')).toEqual([])
    expect(knownCards(g, 1, 0, 'spellbook', 'top')).toEqual([])
    expect(knownCards(g, 0, 0, 'spellbook', 'bottom')).toEqual([])
    expect(knownCards(g, 0, 0, 'atlas', 'top'), 'the other deck is untouched').toEqual([g.players[0].atlas[0]])
  })

  it('a private placement at an end wipes what the OTHER player knew there — even in the same order', () => {
    const g = newGame()
    const sb = g.players[0].spellbook
    const run = sb.slice(0, 2)
    noteKnownCards(g, 'both', 0, 'spellbook', 'top', run)
    // p0 privately takes the two back and puts them on top again, in the very same order
    const taken = sb.splice(0, 2)
    noteAddedToEnd(g, 0, 0, 'spellbook', 'top', taken, () => sb.unshift(...taken))
    expect(knownCards(g, 0, 0, 'spellbook', 'top')).toEqual(run)
    expect(knownCards(g, 1, 0, 'spellbook', 'top'), "p1 can't know the order was kept").toEqual([])
  })
})
