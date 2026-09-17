// Black Mass draws "Evil minions" (Demon/Undead/Monster) from your top seven spells. Under a
// Corruptor avatar ("your Beasts are Monsters, Mortals are Undead, Angels are Demons") those
// converted minions are Evil too — Black Mass must honor the override, not the printed subtypes.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { getScript, makeCtx } from '../src'

function setup(withCorruptor: boolean) {
  const g: any = newGame(); keepBoth(g)
  if (withCorruptor) {
    const av = g.units[g.players[0].avatarUnitId]
    av.name = 'Corruptor'; g.cards[av.cardId].name = 'Corruptor'
  }
  // Grey Wolves is a plain Beast (not Evil on its own) — Corruptor makes it a Monster ⇒ Evil.
  const id = `cbm${g.nextId++}`
  g.cards[id] = { id, name: 'Grey Wolves', owner: 0 }
  g.players[0].spellbook.unshift(id)
  return g
}

function evilPrompt(g: any) {
  getScript('Black Mass')!.onCast!(makeCtx(g, g.players[0].avatarUnitId, 0, []))
  return g.prompts.find((p: any) => /Evil minion/i.test(p.title))
}

describe('Black Mass honors Corruptor when choosing "Evil" minions', () => {
  it('with a Corruptor avatar, a Beast in the spellbook is offered as Evil', () => {
    const prompt = evilPrompt(setup(true))
    expect(prompt, 'an Evil-minion prompt appears').toBeTruthy()
    expect(prompt.data.options, 'the corrupted Beast (now a Monster) is drawable').toContain('Grey Wolves')
  })

  it('without Corruptor, the same Beast is NOT offered (control)', () => {
    const prompt = evilPrompt(setup(false))
    expect((prompt?.data?.options ?? []) as string[], 'a plain Beast is not Evil').not.toContain('Grey Wolves')
  })
})
