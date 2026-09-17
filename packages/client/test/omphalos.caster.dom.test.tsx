// The Omphalos is a spellcaster ARTIFACT. When you cast a spell of its element, the caster
// picker must offer the Omphalos (a highlighted, clickable ground artifact), and choosing it
// threads the cast through the Omphalos.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Omphalos as a spellcaster artifact (caster picker)', () => {
  it('offers the Omphalos as a caster for a Fire spell, and picking it starts the cast', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    // a Char Omphalos (Air and Fire Spellcaster) you control, on the board
    const artCard = `co${g.nextId++}`; g.cards[artCard] = { id: artCard, name: 'Char Omphalos', owner: me }
    const artId = `ao${g.nextId++}`
    g.artifacts[artId] = { id: artId, cardId: artCard, name: 'Char Omphalos', conjuredBy: me, x: 0, y: 0, region: 'surface', tapped: false }
    // a Fire spell in hand (both your avatar and the Omphalos can cast it → a caster picker)
    const fbCard = `cfb${g.nextId++}`; g.cards[fbCard] = { id: fbCard, name: 'Fireball', owner: me }
    g.players[me].hand.push(fbCard)
    g.players[me].mana = 20
    g.flow = { ...(g.flow ?? {}), noThreshold: { [me]: g.turn } }

    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector('[data-hand][data-card="Fireball"]') as HTMLElement)
    h.rerender()

    // the caster picker opened and the Omphalos is a highlighted, clickable caster
    expect(h.container.querySelector('[data-modebanner="chooseCaster"]'), 'caster picker opened').toBeTruthy()
    const omphalos = h.container.querySelector(`[data-artifact="${artId}"]`) as HTMLElement
    expect(omphalos, 'the Omphalos renders on the board').toBeTruthy()
    expect(omphalos.getAttribute('data-target'), 'the Omphalos is highlighted as a legal caster').toBe('1')

    // pick the Omphalos → the cast proceeds (picker closes)
    h.click(omphalos)
    h.rerender()
    expect(h.container.querySelector('[data-modebanner="chooseCaster"]'), 'picking the Omphalos started the cast').toBeFalsy()
  })
})
