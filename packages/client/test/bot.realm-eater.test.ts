// An enemy Realm-Eater destroys sites it successfully attacks, so a site played on its square is just its
// next meal. The bot never plants a site there, and when the only free square left in its home territory
// is under the Realm-Eater, building outside home isn't penalised as "premature".
import { describe, it, expect } from 'vitest'
import { board, place, inject, expandActions, explainEval, underEnemySiteEater, type GameState } from '@sorcery/shared'
import { botAction } from '../src/bot'

const EATER = { x: 1, y: 0 } // a void inside player 0's home (x 1–3, rows 0–1)

/** p0 owns every home square except (1,0), where the ENEMY avatar — a Realm-Eater — stands */
function eaterBoard(eater = true): GameState {
  const g = board() // p0 sites (2,0) (2,1) (3,1) (1,1)
  place(g, 0, 'Rustic Village', 3, 0)
  const foe = g.units[g.players[1].avatarUnitId]
  if (eater) foe.name = 'Realm-Eater'
  foe.x = EATER.x; foe.y = EATER.y
  inject(g, 0, 'Rustic Village') // a site in hand to play
  return g
}
const isPlayAt = (a: any, sq: { x: number; y: number }) => a.t === 'avatarSite' && a.mode === 'play' && a.x === sq.x && a.y === sq.y

describe('bot vs an enemy Realm-Eater', () => {
  it('flags only the square the enemy Realm-Eater stands on', () => {
    const g = eaterBoard()
    expect(underEnemySiteEater(g, 0, EATER.x, EATER.y)).toBe(true)
    expect(underEnemySiteEater(g, 1, EATER.x, EATER.y), 'your own Realm-Eater is not a threat').toBe(false)
    expect(underEnemySiteEater(eaterBoard(false), 0, EATER.x, EATER.y), 'any other avatar is fine').toBe(false)
  })

  it('the search bot never considers a site play under it (other squares stay)', () => {
    const plays = expandActions(eaterBoard(), 0).map((e) => e.action).filter((a: any) => a.t === 'avatarSite' && a.mode === 'play')
    expect(plays.length, 'it still has legal site plays elsewhere').toBeGreaterThan(0)
    expect(plays.some((a) => isPlayAt(a, EATER))).toBe(false)
    // control: with a harmless enemy avatar there, that square is a candidate
    const ctl = expandActions(eaterBoard(false), 0).map((e) => e.action)
    expect(ctl.some((a) => isPlayAt(a, EATER))).toBe(true)
  })

  it('the fast bot plays its site somewhere else', () => {
    const a: any = botAction(eaterBoard(), 0)
    expect(a.t === 'avatarSite' && a.mode === 'play', `expected a site play, got ${JSON.stringify(a)}`).toBe(true)
    expect(isPlayAt(a, EATER)).toBe(false)
  })

  it('no "premature expansion" penalty when the only home void is under the Realm-Eater', () => {
    const outside = (g: GameState) => { place(g, 0, 'Rustic Village', 0, 1); return g } // a site outside home (x 0)
    expect(explainEval(outside(eaterBoard()), 0).terms.homePremature ?? 0).toBe(0)
    // control: the same void with no Realm-Eater on it still counts as fillable → penalised
    expect(explainEval(outside(eaterBoard(false)), 0).terms.homePremature ?? 0).toBeLessThan(0)
  })
})
