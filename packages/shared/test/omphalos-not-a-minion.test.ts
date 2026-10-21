// An Omphalos is a spellcaster ARTIFACT, not a minion: "minions directly above it are disabled" (Root
// Spider) must not touch it. It casts through a positioned stand-in unit, which used to be run through the
// minion-disable checks and so lost Spellcaster ("Char Omphalos is not a Spellcaster.").
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, injectToHand, giveMana, waiveThreshold } from './helpers'
import { canCast, isDisabled, checkStateBased, type GameState } from '../src'
import '../src/cards/scripts/index'

function omphalosOverSpider(): { g: GameState; cardId: string } {
  const g = newGame(42, 0); keepBoth(g)
  placeSite(g, 0, 'Rustic Village', 2, 0); placeSite(g, 0, 'Rustic Village', 2, 1)
  giveMana(g, 0, 9); waiveThreshold(g, 0)
  g.cards.comph = { id: 'comph', name: 'Char Omphalos', owner: 0 } as any
  g.artifacts.aomph = { id: 'aomph', cardId: 'comph', name: 'Char Omphalos', conjuredBy: 0, x: 2, y: 1, region: 'surface', tapped: false } as any
  const spider = summonCard(g, 1, 'Root Spider', 2, 1); spider.region = 'underground' // burrowed right below
  const cardId = injectToHand(g, 0, 'Fireball') // Char Omphalos: Air/Fire spellcaster
  g.flow.lockedCards = [{ cardId, casterId: 'aomph', grantsCasting: false }]
  return { g, cardId }
}

describe('Root Spider vs an Omphalos', () => {
  it('an Omphalos above a burrowed Root Spider can still cast its spell', () => {
    const { g, cardId } = omphalosOverSpider()
    expect(canCast(g, 0, cardId, 'aomph').ok).toBe(true)
  })

  it('a minion standing there IS still disabled', () => {
    const { g } = omphalosOverSpider()
    const minion = summonCard(g, 0, 'Bone Jumble', 2, 1)
    expect(isDisabled(g, minion)).toBe(true)
  })
})

// Same for SILENCE: an effect that silences MINIONS doesn't touch an Omphalos (only one that names
// artifacts does — Acid Rain: "Silence affected sites and artifacts there").
describe('minion silences vs an Omphalos', () => {
  function omphalos(): { g: GameState; cardId: string } {
    const { g, cardId } = omphalosOverSpider()
    for (const u of Object.values(g.units)) if (u.name === 'Root Spider') delete g.units[u.id] // no spider here
    return { g, cardId }
  }
  const aura = (g: GameState, name: string) => {
    g.cards.caura = { id: 'caura', name, owner: 1 } as any
    ;(g.auras as any).raura = { id: 'raura', cardId: 'caura', name, controller: 1, squares: [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }] }
  }

  it('Silence (aura: "minions occupying affected sites are silenced") leaves it able to cast', () => {
    const { g, cardId } = omphalos()
    aura(g, 'Silence'); checkStateBased(g)
    const minion = summonCard(g, 0, 'Bone Jumble', 2, 1); checkStateBased(g)
    expect(g.units[minion.id].silenced, 'a minion there IS silenced').toBe(true)
    expect(canCast(g, 0, cardId, 'aomph').ok).toBe(true)
  })

  for (const name of ['Sisters of Silence', 'Sister Stefánia']) {
    it(`${name} ("other nearby minions are silenced") leaves it able to cast`, () => {
      const { g, cardId } = omphalos()
      summonCard(g, 1, name, 2, 1); checkStateBased(g)
      expect(canCast(g, 0, cardId, 'aomph').ok).toBe(true)
    })
  }

  it('Acid Rain, which DOES name artifacts, silences it', () => {
    const { g, cardId } = omphalos()
    aura(g, 'Acid Rain'); checkStateBased(g)
    expect(canCast(g, 0, cardId, 'aomph').ok).toBe(false)
  })
})
