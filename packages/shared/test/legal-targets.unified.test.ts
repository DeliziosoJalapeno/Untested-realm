// One target-legality source for every picker: legalTargetsFor offers exactly what castSpell accepts.
// Before, a cast from hand (client), an effect cast (Archimago's echo, a collection cast), the search bot
// and the Fast bot each rebuilt the candidate list themselves, and drifted: an effect-cast Blink measured
// its square from the caster, the bot ignored targetOptions, the Fast bot's "adjacent" was off.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer, fillSites, giveArtifact } from './helpers'
import {
  castSpell, effectCastSpell, legalTargetsFor, specIndexForPick, targetRefId, getScript, allCards,
  type GameState, type TargetRef, type TargetSpec, type UnitState,
} from '../src'
import '../src/cards/scripts/index'

const spec = (count: number): TargetSpec => ({ what: 'unit', count, targeted: false })

/** a busy board: sites everywhere, allies and enemies near and far, a carried artifact */
function busyBoard(): { g: GameState; av: UnitState } {
  const g = newGame() as GameState; keepBoth(g)
  fillSites(g, 0)
  const av = Object.values(g.units).find((u) => u.isAvatar && u.controller === 0)!
  av.x = 2; av.y = 2
  const foeAv = Object.values(g.units).find((u) => u.isAvatar && u.controller === 1)!
  foeAv.x = 2; foeAv.y = 0
  for (const [p, name, x, y] of [
    [0, 'Cave Trolls', 2, 2], [0, 'Bone Jumble', 1, 1], [0, 'Escyllion Cyclops', 4, 3],
    [1, 'Stygian Archers', 2, 1], [1, 'Bone Jumble', 3, 2], [1, 'Cave Trolls', 0, 3],
  ] as const) { const u = summonCard(g, p, name, x, y); u.enteredTurn = -1 }
  giveArtifact(g, Object.values(g.units).find((u) => u.name === 'Escyllion Cyclops')!, 'Excalibur')
  g.players[0].mana += 50
  g.flow = g.flow ?? {}
  g.flow.noThreshold = { 0: g.turn }
  return { g, av }
}

describe('legalTargetsFor', () => {
  it('specIndexForPick fills the specs in order, count each — as castSpell assigns targets', () => {
    const specs = [spec(1), spec(2), spec(1)]
    expect([0, 1, 2, 3, 4].map((n) => specIndexForPick(specs, n))).toEqual([0, 1, 1, 2, -1])
  })

  it('every targeted Magic: a cast built only from offered picks is never refused for its targets', () => {
    const targetErr = /target|Must choose|Wrong|nearby|adjacent|here|region|ward|Stealth|compels|magic|Avatars are not|swallowed|face down|No such/i
    const names = allCards.filter((c) => c.type === 'Magic').map((c) => c.name)
      .filter((n) => (getScript(n)?.targets?.length ?? 0) > 0 && !getScript(n)?.shootsProjectile)
    expect(names.length).toBeGreaterThan(50)
    const refused: string[] = []
    let cast = 0
    for (const name of names) {
      const { g, av } = busyBoard()
      const script = getScript(name)!
      const pick = { script, specs: script.targets!, caster: av, player: 0 as const, magic: true }
      const picked: TargetRef[] = []
      let ok = true
      for (let i = 0; i < pick.specs.reduce((a, s) => a + s.count, 0); i++) {
        const legal = legalTargetsFor(g, pick, picked)
        if (!legal.length) { ok = !!pick.specs[specIndexForPick(pick.specs, i)]?.upTo; break }
        picked.push(legal[legal.length - 1]) // the last offered (not the first) — any offered pick must do
      }
      if (!ok) continue
      const id = `ctest${g.nextId++}`
      g.cards[id] = { id, name, owner: 0 } as any
      g.players[0].hand.push(id)
      const err = castSpell(g, 0, id, av.id, undefined, picked.map(targetRefId))
      if (err && targetErr.test(err)) refused.push(`${name}: ${err}`)
      else if (!err) cast++
    }
    expect(refused).toEqual([])
    expect(cast).toBeGreaterThan(30)
  }, 60_000)

  it('an effect-cast Trial by Water offers only minions nearby the chosen ally', () => {
    const g = newGame() as GameState; keepBoth(g)
    fillSites(g, 0)
    const av = Object.values(g.units).find((u) => u.isAvatar && u.controller === 0)!
    av.x = 4; av.y = 3
    const ally = summonCard(g, 0, 'Bone Jumble', 0, 0); ally.enteredTurn = -1
    const near = summonCard(g, 1, 'Cave Trolls', 1, 0) // nearby the ally
    const far = summonCard(g, 1, 'Cave Trolls', 4, 2) // nearby the Avatar, not the ally
    effectCastSpell(g, 0, 'Trial by Water', { free: true, tokenCopy: true, caster: av.id })
    answer(g, [ally.id])
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect(p.data.candidates).toContain(near.id)
    expect(p.data.candidates).not.toContain(far.id)
  })

  it('a dependent square after a placed site: Blink cast by an effect never offers the void', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 0, 0)
    placeSite(g, 0, 'Rustic Village', 1, 0)
    const av = Object.values(g.units).find((u) => u.isAvatar && u.controller === 0)!
    av.x = 4; av.y = 3
    const ally = summonCard(g, 0, 'Bone Jumble', 0, 0); ally.enteredTurn = -1
    effectCastSpell(g, 0, 'Blink', { free: true, tokenCopy: true, caster: av.id })
    answer(g, [ally.id])
    const squares = (g.prompts[0] as any).data.squares as { x: number; y: number }[]
    // Blink's own targetOptions: real locations in the ally's region — the two sites, no void squares
    expect(squares.map((s) => `${s.x},${s.y}`).sort()).toEqual(['0,0', '1,0'])
  })
})
