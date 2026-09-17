// Repro: casting Teleport (an ally → a target site) must animate — the card zaps out of its old tile
// (.anim-teleout) and the destination square glows (.tele-glow). Bug report: the unit just appears at the
// destination with no animation. We cast through the REAL Game pipeline (viewFor + effects), as the app does.
import { describe, it, expect, afterEach } from 'vitest'
import { usummon } from '@sorcery/shared'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Teleport spell animation', () => {
  it('records a teleport and animates the zap-out + destination glow', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    // an ally minion to teleport, and a site to teleport it onto
    const uId = usummon(g, me, 'Bone Jumble', 0, 0)
    g.units[uId].enteredTurn = -5
    const scid = `cs${g.nextId++}`; g.cards[scid] = { id: scid, name: 'Rustic Village', owner: me }
    const sid = `st${g.nextId++}`
    g.sites[sid] = { id: sid, cardId: scid, name: 'Rustic Village', owner: me, controller: me, x: 3, y: 0, tapped: false, isRubble: false }
    const tp = `ctp${g.nextId++}`; g.cards[tp] = { id: tp, name: 'Teleport', owner: me }
    g.players[me].hand.push(tp)
    g.players[me].mana = 20
    g.flow = { ...(g.flow ?? {}), noThreshold: { [me]: g.turn } }

    const h = new GameHarness(g).mount(); active = h
    // cast Teleport: ally = the minion, target site = Rustic Village at (3,0)
    h.send({ t: 'castSpell', cardId: tp, casterId: g.players[me].avatarUnitId, targets: [uId, sid] } as any)
    h.rerender()

    // engine recorded the teleport…
    const rec = (h.state.flow as any)?.teleportAnim?.at(-1)
    expect(rec, 'a teleport was recorded').toBeTruthy()
    expect(rec.unitId).toBe(uId)
    expect([rec.from.x, rec.from.y], 'from the source square').toEqual([0, 0])
    expect([rec.to.x, rec.to.y], 'to the destination site').toEqual([3, 0])
    // …and the client animates it: destination glow + in-tile zap-out ghost
    expect(h.container.querySelector('.tele-glow'), 'destination square glows').toBeTruthy()
    expect(h.container.querySelector('.units .unit.anim-teleout'), 'the card zaps out of its old tile').toBeTruthy()
  })
})
