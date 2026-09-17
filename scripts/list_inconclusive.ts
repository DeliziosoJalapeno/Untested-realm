// One-off triage: list every non-Avatar card the brute-force oracle cannot cast on
// the generic audit board (the DOM cast-sweep's 'engine-inconclusive' bucket), so we
// can say WHICH cards were never DOM-proven and why. Mirrors audit_playable's
// engineCanPlay exactly.
import { applyAction, board, inject, ALL_SQUARES, type Action, type GameState } from '../packages/shared/src'
import { allCards } from '../packages/shared/src/cards/db'
import '../packages/shared/src/cards/scripts/index'

function engineCanPlay(name: string, type: string): boolean {
  const g0 = board()
  inject(g0, 0, name)
  const caster = g0.players[0].avatarUnitId
  const uIds = Object.keys(g0.units); const sIds = Object.keys(g0.sites)
  const shapes: Action[] = []
  if (type === 'Site') for (const sq of ALL_SQUARES) shapes.push({ t: 'avatarSite', mode: 'play', cardId: '', x: sq.x, y: sq.y } as any)
  else {
    const targetSets: any[] = [undefined, [], [uIds[0]], [uIds[1]], [sIds[0]], [uIds[0], uIds[1]], [uIds[0], sIds[0]], ['sq:2,2,surface']]
    const extras = [undefined, { direction: 'e' }, { giveTo: caster }]
    const ats: any[] = [undefined, ...ALL_SQUARES.map((s) => ({ ...s, region: 'surface' }))]
    for (const at of ats) for (const targets of targetSets) for (const extra of extras) shapes.push({ t: 'castSpell', cardId: '', casterId: caster, at, targets, extra } as any)
  }
  for (const shape of shapes) {
    const g: GameState = board(); const c = inject(g, 0, name)
    const a = { ...shape, cardId: c, casterId: g.players[0].avatarUnitId } as Action
    let res
    try { res = applyAction(g, 0, a) } catch { continue }
    if (res.ok) return true
  }
  return false
}

const inconclusive: Record<string, string[]> = {}
for (const c of allCards) {
  if (c.type === 'Avatar') continue
  if (!engineCanPlay(c.name, c.type)) {
    (inconclusive[c.type] = inconclusive[c.type] ?? []).push(c.name)
  }
}
let total = 0
for (const [type, names] of Object.entries(inconclusive)) {
  total += names.length
  console.log(`\n${type} (${names.length}): ${names.sort().join(', ')}`)
}
console.log(`\nTOTAL engine-inconclusive on generic board: ${total}`)
