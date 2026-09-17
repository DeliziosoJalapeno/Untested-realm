// Each end-of-turn effect must resolve COMPLETELY — including any prompt it raises — before the next
// end-of-turn effect in the queue fires. Here Lord of Greed (which prompts "snatch which artifact?")
// is ordered ahead of Conqueror Worm (which silently claims its site); the Worm must NOT claim until
// the Lord's prompt is answered.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, answer, act } from './helpers'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

function putArtifact(g: any, name: string, x: number, y: number): string {
  const cid = `ca${g.nextId++}`; g.cards[cid] = { id: cid, name, owner: 0 }
  const aid = `a${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name, conjuredBy: 0, x, y, region: 'surface', carriedBy: null, tapped: false }
  return aid
}

describe('end-of-turn effects resolve one at a time', () => {
  it('a later trigger waits for the earlier one\'s prompt to resolve', () => {
    const g: GameState = newGame(); keepBoth(g)
    // Lord of Greed (prompts when 2+ artifacts can be snatched)
    const lord = summonCard(g, 0, 'Lord of Greed', 1, 1); lord.enteredTurn = -1
    putArtifact(g, 'Poisonous Dagger', 3, 3)
    putArtifact(g, 'Poisonous Dagger', 4, 0)
    // Conqueror Worm on an ENEMY site — its end-of-turn silently claims that site
    const enemySite = placeSite(g, 1, 'Rustic Village', 2, 2)
    const worm = summonCard(g, 0, 'Conqueror Worm', 2, 2); worm.enteredTurn = -1

    act(g, 0, { t: 'endTurn' })

    // two end-of-turn effects → order prompt. Put Lord of Greed FIRST.
    const order = g.prompts[0]
    expect(order?.kind, 'ordering prompt for the two effects').toBe('orderCards')
    const names: string[] = order.data.cards
    const lordIdx = names.indexOf('Lord of Greed')
    const wormIdx = names.indexOf('Conqueror Worm')
    expect(lordIdx).toBeGreaterThanOrEqual(0)
    expect(wormIdx).toBeGreaterThanOrEqual(0)
    answer(g, [lordIdx, wormIdx])

    // Lord of Greed ran first and is now asking which artifact to snatch — the queue is PAUSED here.
    expect(g.prompts[0]?.title, 'the Lord of Greed prompt is open').toContain('Lord of Greed')
    expect(g.sites[enemySite.id]?.controller, 'the Worm has NOT claimed its site yet').toBe(1)

    // answer the Lord's prompt → the queue resumes → the Worm's effect finally runs
    answer(g, g.prompts[0].data.candidates[0])
    expect(g.sites[enemySite.id]?.controller, 'now the Worm claims the site').toBe(0)
  })
})
