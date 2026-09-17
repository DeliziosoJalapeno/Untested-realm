// A directional grid spell (Lava Flow) opens a `chooseOption` prompt whose cont/ctx the
// CLIENT needs to pre-compute the area-damage confirmation grid. viewFor must expose
// prompt.cont + prompt.ctx to the ADDRESSED player (their own cast bookkeeping) and hide
// them from the opponent — otherwise tryAreaConfirmFromPrompt reads an empty cont and the
// pre-cast grid never shows.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, giveMana, waiveThreshold } from './helpers'
import { avatarOf, viewFor } from '../src'

describe('prompt cont/ctx in the view', () => {
  it('the caster sees cont+ctx; the opponent sees neither', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    for (const x of [0, 1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 0)
    castMagic(g, 0, 'Lava Flow') // stops at the "which direction?" prompt, addressed to player 0

    const mine = viewFor(g, 0).prompts[0] as any
    expect(mine.cont, 'the caster gets the continuation key').toBe('script:Lava Flow:flow')
    expect(mine.ctx?.sourceId, 'the caster gets the casting sourceId (needed to resolve the grid)').toBe(av.id)

    const theirs = viewFor(g, 1).prompts[0] as any
    expect(theirs.cont, 'the opponent never sees the cont').toBe('')
    expect(theirs.ctx, 'the opponent never sees the ctx').toBeUndefined()
    expect(theirs.data, 'the opponent never sees the prompt data either').toEqual({})
  })
})
