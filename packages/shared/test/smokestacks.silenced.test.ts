// A silencer SITE that is itself silenced silences nothing (FAQ layering: an older Smokestacks shuts a
// newer one off; a Smokestacks under an Acid Rain / Silence effect stops hushing its neighbours). siteSilenced
// now skips a silencer that is itself silenced, with a cycle guard so two mutual silencers can't loop.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { siteSilenced } from '../src'

describe('a silenced silencer site silences nothing', () => {
  it('Smokestacks silenced by Acid Rain no longer silences a neighbouring site', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 1, 'Smokestacks of Gnaak', 2, 1) // silences nearby sites
    placeSite(g, 0, 'Hamlet', 1, 1) // a site nearby the Smokestacks

    expect(siteSilenced(g, { x: 1, y: 1 }), 'baseline: the active Smokestacks silences its neighbour').toBe(true)

    // an Acid Rain aura silences the Smokestacks itself (its square only)
    const acid = `ctestR${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Acid Rain', owner: 1 }
    const rid = `rtest${g.nextId++}`
    g.auras[rid] = { id: rid, cardId: acid, name: 'Acid Rain', controller: 1, squares: [{ x: 2, y: 1 }] }

    expect(siteSilenced(g, { x: 2, y: 1 }), 'the Smokestacks is now silenced by Acid Rain').toBe(true)
    expect(siteSilenced(g, { x: 1, y: 1 }), 'a silenced Smokestacks no longer silences its neighbour').toBe(false)
  })
})
