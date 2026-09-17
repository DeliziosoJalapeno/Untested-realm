// "Reveal" cards that act on cards from the top of a spellbook should fire the opponent-facing
// reveal UNLESS the card is actually summoned/played (the summon already shows it). This pins the
// rule for Lilith, Mother Nature, Searing Truth, and Pigs of the Sounder.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { getScript, makeCtx } from '../src'

const revealsInclude = (g: any, name: string) => JSON.stringify(g.flow?.reveals ?? []).includes(name)

describe('reveal fires unless the card is summoned', () => {
  it('Lilith: a NON-minion top spell is revealed and buried; a minion is summoned and NOT separately revealed', () => {
    // non-minion → revealed + bottom
    const g = newGame(); keepBoth(g)
    const lil = summonCard(g, 0, 'Lilith', 2, 2); lil.enteredTurn = -1
    const oppTop = g.players[1].spellbook[0]
    g.cards[oppTop].name = 'Common Sense' // a Magic (not a minion)
    getScript('Lilith')!.endOfTurn!(makeCtx(g, lil.id, 0, []))
    expect(revealsInclude(g, 'Common Sense'), 'the non-minion top spell is revealed').toBe(true)
    expect(g.players[1].spellbook[g.players[1].spellbook.length - 1], 'and put on the bottom').toBe(oppTop)

    // minion → summoned (shown by the summon), so NOT separately revealed
    const g2 = newGame(); keepBoth(g2)
    const lil2 = summonCard(g2, 0, 'Lilith', 2, 2); lil2.enteredTurn = -1
    g2.cards[g2.players[1].spellbook[0]].name = 'Bone Jumble' // a Minion
    getScript('Lilith')!.endOfTurn!(makeCtx(g2, lil2.id, 0, []))
    expect(Object.values(g2.units).some((u: any) => u.name === 'Bone Jumble' && u.controller === 0), 'the minion is seduced under your control').toBe(true)
    expect(revealsInclude(g2, 'Bone Jumble'), 'a summoned minion is NOT separately revealed').toBe(false)
  })

  it('Mother Nature: a non-minion topmost spell is revealed', () => {
    const g = newGame(); keepBoth(g)
    const mn = summonCard(g, 0, 'Mother Nature', 2, 2); mn.enteredTurn = -1
    g.cards[g.players[0].spellbook[0]].name = 'Common Sense'
    getScript('Mother Nature')!.startOfTurn!(makeCtx(g, mn.id, 0, []))
    expect(revealsInclude(g, 'Common Sense'), 'a non-minion topmost spell is revealed').toBe(true)
  })

  it('Searing Truth reveals both drawn spells', () => {
    const g = newGame(); keepBoth(g)
    const p = g.players[0]
    g.cards[p.spellbook[0]].name = 'Common Sense'
    g.cards[p.spellbook[1]].name = 'Bone Jumble'
    getScript('Searing Truth')!.conts!.sear!(makeCtx(g, p.avatarUnitId, 0, []), {}, 'you')
    expect(revealsInclude(g, 'Common Sense') && revealsInclude(g, 'Bone Jumble'), 'both drawn spells are revealed').toBe(true)
  })
})
