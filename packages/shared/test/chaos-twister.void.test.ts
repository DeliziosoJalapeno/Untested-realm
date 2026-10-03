// Chaos Twister + the void. FAQ: "What if the minion lands in the void? It deals no damage (even to
// itself). Since it's now in the void, it is banished (unless it has Voidwalk)." Previously the blown
// minion could only land on a SITE (or fly off the board) — a void landing was never modelled.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { makeCtx, avatarOf, type GameState } from '../src'
import { applyLanding } from '../src/cards/scripts/gen/special-helpers'
import '../src/cards/scripts/index'

function clearAvatars(g: GameState) {
  avatarOf(g, 0).x = 0; avatarOf(g, 0).y = 0
  avatarOf(g, 1).x = 4; avatarOf(g, 1).y = 3
}

describe('Chaos Twister landing in the void', () => {
  it('deals no damage and banishes a non-Voidwalk minion blown onto a siteless square', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g); clearAvatars(g)
    const enemy = summonCard(g, 1, 'Bone Jumble', 3, 1); enemy.enteredTurn = -1 // a bystander with its own site
    placeSite(g, 0, 'Rustic Village', 3, 1)
    const blown = summonCard(g, 0, 'Escyllion Cyclops', 2, 1); blown.enteredTurn = -1 // power 6
    const enemyLifeBefore = enemy.life

    // land it on (1,1) — a square with NO site → the void
    applyLanding(makeCtx(g, avatarOf(g, 0).id, 0, []), blown.id, { x: 1, y: 1 })

    expect(g.units[blown.id], 'non-Voidwalk minion is banished by the void').toBeUndefined()
    expect(enemy.life, 'no damage dealt to anyone (not even itself)').toBe(enemyLifeBefore)
  })

  it('a Voidwalk minion drifts in the void instead of being banished, still no damage', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g); clearAvatars(g)
    const blown = summonCard(g, 0, 'Bone Jumble', 2, 1); blown.enteredTurn = -1
    blown.modifiers.push({ kind: 'keyword', keyword: 'voidwalk', duration: 'permanent', turn: g.turn } as any)

    applyLanding(makeCtx(g, avatarOf(g, 0).id, 0, []), blown.id, { x: 1, y: 1 })

    expect(g.units[blown.id], 'Voidwalk minion survives the void').toBeTruthy()
    expect(g.units[blown.id]?.region, 'and is now in the void region').toBe('void')
  })

  it('still deals its power to everyone atop a SITE it lands on (regression)', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g); clearAvatars(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const enemy = summonCard(g, 1, 'Bone Jumble', 2, 2); enemy.enteredTurn = -1 // 1/1 on the landing site
    const blown = summonCard(g, 0, 'Escyllion Cyclops', 0, 2); blown.enteredTurn = -1 // power 6

    applyLanding(makeCtx(g, avatarOf(g, 0).id, 0, []), blown.id, { x: 2, y: 2 })

    expect(g.units[enemy.id], 'the enemy atop the landing site took the crash damage and died').toBeUndefined()
  })
})
