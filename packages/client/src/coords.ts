// Board-coordinate display. The ENGINE always names squares in chess notation (a1–e4, via
// grid.ts squareLabel) — in logs, prompt titles and option labels. Which system the PLAYER sees is a
// client preference (settings.coordSystem). So the client formats its own coords with fmtCoord, and
// re-labels any engine-produced chess token for display with relabelCoords. The underlying values the
// engine round-trips (e.g. a chooseOption's option string) are never touched — only what's shown.
import { GRID_W } from '@sorcery/shared'
import { getSetting, type CoordSystem } from './settings'

/** Format a board square (0-indexed x,y — x left→right, y top→bottom) in the player's chosen system. */
export function fmtCoord(x: number, y: number, sys: CoordSystem = getSetting('coordSystem')): string {
  switch (sys) {
    case 'standard':
      return String(y * GRID_W + x + 1) // 1–20, row-major: 1 2 3 4 5 / 6 … / … 20
    case 'cartesian':
      return `(${x + 1},${y + 1})` // 1-indexed (column,row), top-left origin
    case 'chess':
    default:
      return String.fromCharCode(97 + x) + (y + 1) // a1–e4
  }
}

/** A chess square token (a1–e4) anywhere in engine-produced text. Word-bounded so ordinary prose
 *  ("a 1/1 minion") isn't mangled — matches the detection used for the board coord overlay. */
const CHESS_TOKEN = /\b([a-e])([1-4])\b/g

/** Rewrite every chess token in an engine string into the player's chosen system (no-op for chess).
 *  Display-only: callers must keep the original string for anything sent back to the engine. */
export function relabelCoords(text: string, sys: CoordSystem = getSetting('coordSystem')): string {
  if (sys === 'chess' || !text) return text
  return text.replace(CHESS_TOKEN, (_m, col: string, row: string) =>
    fmtCoord(col.charCodeAt(0) - 97, Number(row) - 1, sys),
  )
}
