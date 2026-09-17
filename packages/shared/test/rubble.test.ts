// Rubble is controlled by NO ONE and is replaceable terrain. A site destroyed in play already
// leaves proper rubble; this guards the EDITOR path (placing the 'Rubble' token) and confirms a
// site can be built over rubble by the base avatar site ability.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, answer, placeSite, injectToHand } from './helpers'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

const siteAtXY = (g: GameState, x: number, y: number) =>
  Object.values(g.sites).find((s: any) => s.x === x && s.y === y) as any

describe('rubble', () => {
  it('editor-placed Rubble is uncontrolled and flagged as rubble', () => {
    const g = newGame(); keepBoth(g)
    act(g, 0, { t: 'judge', op: { k: 'placeSite', name: 'Rubble', x: 1, y: 1, player: 0 } } as any)
    const r = siteAtXY(g, 1, 1)
    expect(r?.isRubble, 'flagged as rubble').toBe(true)
    expect(r?.controller, 'controlled by no one').toBe(null)
  })

  it('a site can be played over rubble by the base avatar site ability', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 1, 1) // a site to border the placement from
    act(g, 0, { t: 'judge', op: { k: 'placeSite', name: 'Rubble', x: 2, y: 1, player: 0 } } as any) // rubble next to it
    expect(siteAtXY(g, 2, 1)?.isRubble, 'the editor made real rubble').toBe(true)

    const card = injectToHand(g, 0, 'Rustic Village')
    avatarOf(g, 0).tapped = false
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: card, x: 2, y: 1 }) // build over the rubble
    if (g.prompts.length) answer(g, false)

    const played = siteAtXY(g, 2, 1)
    expect(played?.isRubble, 'rubble replaced by a real site').toBe(false)
    expect(played?.controller, 'the new site is controlled by the player who built it').toBe(0)
  })
})
