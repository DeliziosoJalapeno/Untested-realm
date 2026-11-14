// The 12 official precons (Alpha, Beta, Gothic — four each): complete, fully implemented, and matched
// EXACTLY by matchPrecon (precon rooms accept nothing else). Plus the two Frost Mage vs Lavamancer decks
// (printed lists: 60 spells + 10 collection; Frost Mage 34 sites, Lavamancer 30).
import { describe, it, expect } from 'vitest'
import { PRECONS, matchPrecon, getCard, cardSupport, createGame, applyAction } from '../src'
import '../src/cards/scripts/index'

const count = (z: Record<string, number> | undefined) => Object.values(z ?? {}).reduce((a, b) => a + b, 0)

describe('precon decks', () => {
  it('12 decks: four each from Alpha, Beta and Gothic, plus the two Frost Mage vs Lavamancer decks; unique ids and avatars', () => {
    expect(PRECONS.length).toBe(14)
    for (const set of ['Alpha', 'Beta', 'Gothic']) expect(PRECONS.filter((p) => p.set === set).length).toBe(4)
    expect(PRECONS.filter((p) => p.set === 'Frost Mage vs Lavamancer').map((p) => p.avatar)).toEqual(['Frost Mage', 'Lavamancer'])
    expect(new Set(PRECONS.map((p) => p.id)).size).toBe(14)
    expect(new Set(PRECONS.map((p) => p.avatar)).size).toBe(14)
  })

  it('each is an avatar + 36 spells + 16 sites (Frost Mage vs Lavamancer: 60 + 30/34 + 10 collection), every card known and implemented', () => {
    for (const p of PRECONS) {
      const fvl = p.set === 'Frost Mage vs Lavamancer'
      expect(count(p.spellbook), p.name).toBe(fvl ? 60 : 36)
      expect(count(p.atlas), p.name).toBe(!fvl ? 16 : p.avatar === 'Frost Mage' ? 34 : 30)
      if (fvl) expect(count(p.collection), p.name).toBe(10)
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
      const a = PRECONS[i], b = PRECONS[(i + 5) % PRECONS.length]
      const g = createGame([a, b], ['A', 'B'], 100 + i, 0)
      expect(applyAction(g, 0, { t: 'keepHand' }).ok).toBe(true)
      expect(applyAction(g, 1, { t: 'keepHand' }).ok).toBe(true)
      expect(g.phase, `${a.name} vs ${b.name}`).not.toBe('mulligan')
    }
  })
})
