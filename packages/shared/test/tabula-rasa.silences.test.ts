// Tabula Rasa: "Bearer is silenced, can't be modified otherwise, and can't drop Tabula Rasa." The
// "can't be modified" immunity it grants made the bearer immune to silence — including Tabula Rasa's own,
// so the bearer kept all its abilities. "Otherwise" means its own silence still applies.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, waiveThreshold, act } from './helpers'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Tabula Rasa silences its bearer', () => {
  it('cast onto a minion: the bearer is silenced and its end-of-turn shot never fires', () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    placeSite(g, 0, 'Rustic Village', av.x, av.y + 1)
    const dragon = summonCard(g, 0, 'Colicky Dragonettes', av.x, av.y + 1); dragon.enteredTurn = -1
    castMagic(g, 0, 'Tabula Rasa', { at: { x: dragon.x, y: dragon.y }, extra: { giveTo: dragon.id } })
    expect(Object.values(g.artifacts).some((a) => a.name === 'Tabula Rasa' && a.carriedBy === dragon.id)).toBe(true)
    expect(g.units[dragon.id].silenced, 'silenced').toBe(true)
    act(g, 0, { t: 'endTurn' })
    expect(g.prompts.map((p) => p.cont)).not.toContain('script:Colicky Dragonettes:hiccup')
  })

  it("it's still unmodifiable otherwise: Pollimorph can't transform the bearer", () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    placeSite(g, 0, 'Rustic Village', av.x, av.y + 1)
    const m = summonCard(g, 1, 'Stygian Archers', av.x, av.y + 1); m.enteredTurn = -1
    castMagic(g, 0, 'Tabula Rasa', { at: { x: m.x, y: m.y }, extra: { giveTo: m.id } })
    expect(g.units[m.id].silenced).toBe(true)
    castMagic(g, 0, 'Pollimorph', { targets: [m.id] })
    expect(g.units[m.id]?.name, 'not turned into a Frog').toBe('Stygian Archers')
  })
})
