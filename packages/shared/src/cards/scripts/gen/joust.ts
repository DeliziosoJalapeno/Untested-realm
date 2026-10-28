import { registerScript } from '../registry'
import { pushLog, protectedFromEnemyMoves } from '../../../engine/effects'
import { isLegalStep, takeOwnStep } from '../../../engine/movement'
import { fightUnits } from '../../../engine/combat'
import { adjacentFightTargets, resolveAdjacentCombatants } from '../multi-card-utils/adjacent-fight'

// "An ally targets an enemy they're adjacent to, then they both take a step to
// swap places. If they pass each other, they fight."
// Each takes its OWN step (Codex, Step def. 2: takeOwnStep — walls, "enters here" triggers, carrier).
// The enemy's step is caused by your spell, so Old Salt Anchorman keeps a nearby ally of his from it.
registerScript('Joust!', {
  targets: adjacentFightTargets('your jouster'),
  onCast: (ctx) => {
    const pair = resolveAdjacentCombatants(ctx)
    if (!pair) return ctx.log('Not adjacent.')
    const { a, b } = pair
    // FAQ: "they BOTH take a step to swap places" — if either can't take its step (Immobile, disabled, a
    // wall or entry-ban between them, an Anchorman), they haven't passed each other, so no joust.
    const aFrom = { x: a.x, y: a.y, region: a.region }
    const bFrom = { x: b.x, y: b.y, region: b.region }
    const held = (u: typeof a) => u.controller !== ctx.controller && protectedFromEnemyMoves(ctx.state, u)
    if (!isLegalStep(ctx.state, a, aFrom, bFrom) || !isLegalStep(ctx.state, b, bFrom, aFrom) || held(a) || held(b)) {
      return ctx.log('One of them cannot take the step — no joust occurs.')
    }
    const aMoved = takeOwnStep(ctx.state, a, bFrom, ctx.controller)
    const bMoved = ctx.state.units[b.id] ? takeOwnStep(ctx.state, b, aFrom, ctx.controller) : false
    if (!aMoved || !bMoved || !ctx.state.units[a.id] || !ctx.state.units[b.id]) return // a step failed or a trigger removed a jouster
    pushLog(ctx.state, ctx.controller, `${a.name} and ${b.name} joust past each other!`)
    // they pass each other and fight — a real simultaneous strike exchange (Interrogator, Lethal, …)
    fightUnits(ctx.state, a, b)
  },
})
