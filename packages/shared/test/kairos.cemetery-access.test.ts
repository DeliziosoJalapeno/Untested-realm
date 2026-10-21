// Kairos the Archivist's restore is the ARCHIVE pulling cards back, not a player accessing a zone: neither
// the Bureau of Occult Control's toll nor Wormelow Tump's seal applies. The restored card always leaves
// the zone it's in — it used to come back while its card stayed in a sealed cemetery (one card, two places).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { makeCtx, getScript, type GameState } from '../src'
import '../src/cards/scripts/index'

const archive = (g: GameState, kId: string) => getScript('Kairos the Archivist')!.genesis!(makeCtx(g, kId, 0, []))
const restore = (g: GameState, kId: string) => getScript('Kairos the Archivist')!.deathrite!(makeCtx(g, kId, 0, []))
const inRealm = (g: GameState, cardId: string) => Object.values(g.units).filter((u) => u.cardId === cardId).length

/** the opponent's minion is archived, then dies into its owner's cemetery */
function archivedThenDead(g: GameState) {
  placeSite(g, 0, 'Fertile Earth', 2, 2)
  const foe = summonCard(g, 1, 'Bone Jumble', 2, 2); foe.enteredTurn = -1
  const kairos = summonCard(g, 0, 'Kairos the Archivist', 1, 1); kairos.enteredTurn = -1
  archive(g, kairos.id)
  delete g.units[foe.id]
  g.players[1].cemetery.push(foe.cardId)
  return { foe, kairos }
}

describe('Kairos restore ignores cemetery protection and tolls', () => {
  it("Wormelow Tump doesn't stop the archive — the card comes back once and leaves the cemetery", () => {
    const g = newGame() as GameState; keepBoth(g)
    const { foe, kairos } = archivedThenDead(g)
    placeSite(g, 1, 'Wormelow Tump', 4, 3) // the opponent seals their cemetery with (E)(E)(E)
    placeSite(g, 1, 'Fertile Earth', 3, 3)
    restore(g, kairos.id)
    expect(inRealm(g, foe.cardId)).toBe(1)
    expect(g.players[1].cemetery).not.toContain(foe.cardId)
  })

  it('the Bureau of Occult Control charges nothing', () => {
    const g = newGame() as GameState; keepBoth(g)
    const { foe, kairos } = archivedThenDead(g)
    placeSite(g, 1, 'Bureau of Occult Control', 4, 3)
    g.players[0].mana = 0
    restore(g, kairos.id)
    expect(g.players[0].mana).toBe(0)
    expect(inRealm(g, foe.cardId)).toBe(1)
    expect(g.players[1].cemetery).not.toContain(foe.cardId)
  })
})
