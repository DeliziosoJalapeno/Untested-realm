// Kairos the Archivist archives the realm, then restores it on Deathrite. Banishment is PERMANENT:
// anything banished since the archive must STAY banished (the restore can't pull it back). And if a
// restored unit ends up on a square whose archived site is itself banished, that square is a void — the
// unit falls into it (banished unless Voidwalk), never left on a phantom surface.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { makeCtx, getScript, type GameState } from '../src'

const archive = (g: GameState, kId: string) => getScript('Kairos the Archivist')!.genesis!(makeCtx(g, kId, 0, []))
const restore = (g: GameState, kId: string) => getScript('Kairos the Archivist')!.deathrite!(makeCtx(g, kId, 0, []))

describe('Kairos restore respects banishment', () => {
  it('a unit banished after the archive is NOT restored — it stays banished', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Hamlet', 2, 2)
    const fs = summonCard(g, 0, 'Foot Soldier', 2, 2); fs.enteredTurn = -1
    const kairos = summonCard(g, 0, 'Kairos the Archivist', 1, 1); kairos.enteredTurn = -1

    archive(g, kairos.id)
    // the Foot Soldier is banished AFTER the archive was taken
    delete g.units[fs.id]
    g.players[0].banished.push(fs.cardId)

    restore(g, kairos.id)
    expect(g.players[0].banished.includes(fs.cardId), 'banished card stays banished').toBe(true)
    expect(Object.values(g.units).some((u: any) => u.cardId === fs.cardId), 'and is NOT pulled back into the realm').toBe(false)
  })

  it('a unit whose archived site was banished lands in the void (banished), not on a phantom surface', () => {
    const g: any = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Hamlet', 2, 2)
    const fs = summonCard(g, 0, 'Foot Soldier', 2, 2); fs.enteredTurn = -1
    const kairos = summonCard(g, 0, 'Kairos the Archivist', 1, 1); kairos.enteredTurn = -1

    archive(g, kairos.id)
    // the site under the Foot Soldier is banished after the archive — it can't be restored
    delete g.sites[site.id]
    g.players[0].banished.push(site.cardId)

    restore(g, kairos.id)
    expect(g.sites[site.id], 'the banished site is not restored').toBeFalsy()
    expect(Object.values(g.sites).some((st: any) => st.x === 2 && st.y === 2), 'its square stays a void').toBe(false)
    expect(Object.values(g.units).some((u: any) => u.cardId === fs.cardId && u.region !== 'void'),
      'the non-voidwalker is not left on the phantom surface of the void').toBe(false)
  })
})
