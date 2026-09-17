import { unitsAt } from '../../../engine/grid'
import type { GameState, PlayerId } from '../../../engine/types'

// 'May be cast to any site without enemies.' (Saracen Raiders / Saracen Scout)
export const summonIfNoEnemies = (state: GameState, player: PlayerId, at: { x: number; y: number }) =>
  unitsAt(state, at.x, at.y).some((u) => u.controller !== player) ? 'That site holds enemies.' : null
