import { registerScript } from '../registry'
import { getCard } from '../../db'
import { adjacentSquaresW } from '../../../engine/grid'
import { effAttack, effDefence } from '../../../engine/statics'
import type { GameState, UnitState } from '../../../engine/types'

const avgPow = (state: GameState, u: UnitState) => Math.floor((effAttack(state, u) + effDefence(state, u)) / 2)

// "weaker than THIS minion" Genesis filters run before the minion is on the board
// (validateTarget's caster is the summoner, not the entering minion), so measure
// against the minion's printed power.
const printedAvg = (name: string) => { const d = getCard(name); return Math.floor(((d.attack ?? 0) + (d.defence ?? 0)) / 2) }

// 'Genesis → Drag target weaker minion from an adjacent site to here, ignoring regions.'
registerScript('Lacuna Entity', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: false, label: 'a weaker minion at an adjacent site',
    filter: (state, u) => avgPow(state, u) < printedAvg('Lacuna Entity'),
  }],
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const t = ctx.targets[0]
    if (!self || !t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    if (!adjacentSquaresW(ctx.state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y)) return
    // forced drag to the Entity's location, "ignoring regions" — and Lacuna dwells in the void
    // (Voidwalk), so the drag must reach INTO the void (a non-Voidwalk victim is then lost to the
    // abyss). Full push semantics otherwise (Cage-lock, push-bans, move-protection).
    ctx.teleport(u.id, self.x, self.y, self.region, { push: true, intoVoid: true })
  },
})
