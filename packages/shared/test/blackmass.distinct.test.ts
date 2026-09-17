// Black Mass: "draw three DIFFERENT Evil minions" — if the top 7 contain two copies of the
// same Evil minion name, the player may only draw ONE copy of that name.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, castMagic, answer, waiveThreshold } from './helpers'
import '../src/cards/scripts/index'

describe('Black Mass draws distinct names (no duplicate name may be drawn twice)', () => {
  it('with two copies of the same Evil minion in the top 7, only one is offered per round', () => {
    const g: any = newGame(); keepBoth(g)
    waiveThreshold(g, 0)

    // Clear spellbook so only our injected cards are there
    g.players[0].spellbook = []

    // Inject two copies of the same Evil minion name (Abaddon Succubus = Demon = Evil)
    for (let i = 0; i < 2; i++) {
      const id = `cbm${g.nextId++}`
      g.cards[id] = { id, name: 'Abaddon Succubus', owner: 0 }
      g.players[0].spellbook.push(id)
    }
    // Inject a different Evil minion (Barrow Wight = Undead = Evil)
    const otherId = `cbm${g.nextId++}`
    g.cards[otherId] = { id: otherId, name: 'Barrow Wight', owner: 0 }
    g.players[0].spellbook.push(otherId)

    // Cast Black Mass via the real action pipeline so conts are registered correctly
    castMagic(g, 0, 'Black Mass')

    // First prompt: Abaddon Succubus and Barrow Wight should both appear exactly once
    const p1 = g.prompts[0]
    expect(p1?.kind, 'first prompt is chooseOption').toBe('chooseOption')
    const opts1: string[] = p1.data.options.filter((o: string) => o !== '(done)')
    expect(opts1.filter((o: string) => o === 'Abaddon Succubus').length,
      'Abaddon Succubus appears exactly once in the first offer').toBe(1)

    // Pick Abaddon Succubus as the first draw
    answer(g, 'Abaddon Succubus')

    // Second prompt: Abaddon Succubus must NOT appear again (already drawn by name)
    const p2 = g.prompts[0]
    expect(p2?.kind, 'second prompt is chooseOption').toBe('chooseOption')
    const opts2: string[] = p2.data.options.filter((o: string) => o !== '(done)')
    expect(opts2, 'Abaddon Succubus is not offered a second time').not.toContain('Abaddon Succubus')
    expect(opts2, 'Barrow Wight is still available').toContain('Barrow Wight')

    // Confirm only one Abaddon Succubus ended up in hand
    const handNames = g.players[0].hand.map((id: string) => g.cards[id].name)
    expect(handNames.filter((n: string) => n === 'Abaddon Succubus').length,
      'only one Abaddon Succubus drawn').toBe(1)
  })
})
