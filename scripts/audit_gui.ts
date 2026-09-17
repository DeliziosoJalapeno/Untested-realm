// GUI contract auditor (no browser / no image analysis). Statically checks that
// the engine's player-facing outputs have a client affordance. Today it enforces
// the decisive, hard-failure contract:
//
//   every PromptKind the engine can emit must be RENDERED by the client —
//   either a PromptBox `case`, or one of the board-click-handled kinds.
//
// A prompt kind with no renderer = a stuck/blank prompt the player can't answer
// (the class the chooseSquare fix addressed). Run in CI to catch regressions.
//   npx tsx scripts/audit_gui.ts
import { readFileSync } from 'node:fs'

const TYPES = 'packages/shared/src/engine/types.ts'
const GAME = 'packages/client/src/components/Game.tsx'

// 1) the PromptKind union members
const typesSrc = readFileSync(TYPES, 'utf8')
const union = typesSrc.match(/export type PromptKind =([\s\S]*?)\n\n/)?.[1] ?? ''
const kinds = [...union.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1])

// 2) kinds the client renders: PromptBox `case '...'` + board-click-handled kinds
const gameSrc = readFileSync(GAME, 'utf8')
const cased = new Set([...gameSrc.matchAll(/case '([a-zA-Z]+)':/g)].map((m) => m[1]))
// chooseSquare & chooseTargets are answered by clicking the board (banner UI, not a
// modal case) — verify the click handlers actually exist rather than trusting a list
const boardHandled = new Set<string>()
if (/prompt\??\.kind === 'chooseSquare'/.test(gameSrc)) boardHandled.add('chooseSquare')
if (/prompt\??\.kind === 'chooseTargets'/.test(gameSrc)) boardHandled.add('chooseTargets')

const missing = kinds.filter((k) => !cased.has(k) && !boardHandled.has(k))

console.log('PromptKinds:', kinds.join(', '))
console.log('PromptBox cases:', [...cased].join(', '))
console.log('board-click handled:', [...boardHandled].join(', '))
if (missing.length) {
  console.error(`\n✗ FAIL: ${missing.length} prompt kind(s) have NO client renderer — players would get a stuck prompt:`)
  for (const k of missing) console.error(`   - ${k}`)
  process.exit(1)
}
console.log(`\n✓ all ${kinds.length} prompt kinds have a client renderer.`)
