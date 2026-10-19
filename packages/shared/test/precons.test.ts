// The 12 official precons (Alpha, Beta, Gothic — four each): complete, fully implemented, and matched
// EXACTLY by matchPrecon (precon rooms accept nothing else).
import { describe, it, expect } from 'vitest'
import { PRECONS, matchPrecon, getCard, cardSupport, createGame, applyAction } from '../src'
import '../src/cards/scripts/index'

const count = (z: Record<string, number> | undefined) => Object.values(z ?? {}).reduce((a, b) => a + b, 0)

describe('precon decks', () => {
  it('12 decks: four each from Alpha, Beta and Gothic, unique ids and avatars', () => {
    expect(PRECONS.length).toBe(12)
    for (const set of ['Alpha', 'Beta', 'Gothic']) expect(PRECONS.filter((p) => p.set === set).length).toBe(4)
    expect(new Set(PRECONS.map((p) => p.id)).size).toBe(12)
    expect(new Set(PRECONS.map((p) => p.avatar)).size).toBe(12)
  })

  it('each is an avatar + 36 spells + 16 sites, every card known and implemented', () => {
    for (const p of PRECONS) {
      expect(count(p.spellbook), p.name).toBe(36)
      expect(count(p.atlas), p.name).toBe(16)
      for (const n of [p.avatar, ...Object.keys(p.spellbook), ...Object.keys(p.atlas), ...Object.keys(p.collection ?? {})]) {
        expect(cardSupport(getCard(n)), `${p.name}: ${n}`).not.toBe('unsupported')
      }
    }
  })

  it('matchPrecon recognises each precon (ignoring name/id/art) and rejects any edit', () => {
    for (const p of PRECONS) {
      expect(matchPrecon({ ...p, name: 'renamed', id: 'x', art: {} } as any)?.id).toBe(p.id)
      const [card] = Object.keys(p.spellbook)
      expect(matchPrecon({ ...p, spellbook: { ...p.spellbook, [card]: p.spellbook[card] + 1 } })).toBeNull()
      expect(matchPrecon({ ...p, avatar: 'Sorcerer' })).toBeNull()
      expect(matchPrecon({ ...p, collection: { ...(p.collection ?? {}), 'Bone Jumble': 1 } })).toBeNull()
    }
    expect(matchPrecon(null)).toBeNull()
  })

  it('every precon can start a game (53-card decks are fine for the engine)', () => {
    for (let i = 0; i < PRECONS.length; i++) {
      const a = PRECONS[i], b = PRECONS[(i + 5) % 12]
      const g = createGame([a, b], ['A', 'B'], 100 + i, 0)
      expect(applyAction(g, 0, { t: 'keepHand' }).ok).toBe(true)
      expect(applyAction(g, 1, { t: 'keepHand' }).ok).toBe(true)
      expect(g.phase, `${a.name} vs ${b.name}`).not.toBe('mulligan')
    }
  })
})
