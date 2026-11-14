// "Win this turn" puzzles, in the tradition of the card-magazine puzzle page: a board, a hand, one
// turn. The opponent's Avatar is at Death's Door, so a single point of damage to it wins — the
// puzzle is getting that point through. The opponent defends as well as the rules allow.
//
// Every puzzle carries its published solution as `line` (a policy: the next move for the position in
// front of it), which the puzzle test plays against EVERY defence the engine allows.
import type { Action, Region } from '@sorcery/shared'
import { scene, unit, alive, inHand, siteOn, type Tut, type Scene, type SceneUnit } from '../tutorial/scene'
import type { Lesson } from '../tutorial/runner'

const AV: [string, string] = ['Elementalist', 'Elementalist']
const HOME: Scene['sites'] = [[0, 'Valley', 2, 0], [0, 'Spire', 2, 1], [0, 'Wasteland', 1, 1], [0, 'Stream', 3, 1]]
/** the defender's ground: its Avatar's site with a ring of sites around it */
const KEEP: Scene['sites'] = [[1, 'Wasteland', 2, 3], [1, 'Wasteland', 2, 2], [1, 'Valley', 1, 2], [1, 'Valley', 3, 2], [1, 'Valley', 1, 3], [1, 'Valley', 3, 3]]
const KEEP_OPEN: Scene['sites'] = KEEP.filter(([, , x, y]) => !(x === 2 && y === 2)) // (2,2) left free for a trap of yours
const U = (key: string, p: 0 | 1, name: string, x: number, y: number, region?: Region): SceneUnit => ({ key, p, name, x, y, region })

const at = (x: number, y: number, region: Region = 'surface') => ({ x, y, region })
const mine = (t: Tut) => (t.g.prompts[0]?.player === 0 ? t.g.prompts[0] : null)
const answer = (t: Tut, choice: any): Action => ({ t: 'prompt', promptId: t.g.prompts[0].id, choice })
const hit = (t: Tut, key: string, to: [number, number], target: string): Action =>
  ({ t: 'moveAttack', unitId: t.ids[key], path: [at(to[0], to[1])], attack: { unit: t.ids[target] } })
const ready = (t: Tut, key: string) => { const u = unit(t, key); return !!u && !u.tapped }
const cast = (t: Tut, name: string, extra: Partial<Extract<Action, { t: 'castSpell' }>> = {}): Action =>
  ({ t: 'castSpell', cardId: inHand(t, name)!, casterId: t.ids.me, ...extra })

interface PuzzleDef {
  id: string
  title: string
  stars: 1 | 2 | 3
  /** the situation, in a sentence or two */
  story: string
  /** what is worth knowing about the cards involved */
  notes?: string
  build: () => Tut
  hints: string[]
  solution: string
  line: (t: Tut) => Action | null
}

const RULES = `**Win this turn.** My Avatar is at Death's Door: one point of damage to it ends the game. I will defend as well as the rules allow.`

const DEFS: PuzzleDef[] = [
  {
    id: 'out-of-the-way', title: 'Out of the way', stars: 1,
    story: `Your Avatar has already played a site this turn, so it can't move — but it can still cast. You hold **Firebolts** and have exactly 2 mana.`,
    notes: `Firebolts: three projectiles in one direction, 1 damage each. A projectile hits the first unit in its path — yours included.`,
    build: () => scene({ avatars: AV, spent: true, sites: [...HOME, ...KEEP], door: [1], hand: ['Firebolts'], mana: 2, units: [
      U('war', 0, 'Amazon Warriors', 2, 1), U('sol', 1, 'Foot Soldiers', 2, 2), U('tro', 1, 'Cave Trolls', 1, 3), U('dog', 1, 'Hellhounds', 3, 3)] }),
    hints: [`Count what stands between your Avatar and mine.`, `Your own Amazon Warriors are the problem, not my Foot Soldiers.`, `Attacking the Foot Soldiers with the Warriors only moves the problem one square forward.`],
    solution: `Step the **Amazon Warriors** sideways (or back), out of the column. Then cast **Firebolts** straight ahead: the first bolt kills the Foot Soldiers, and the other two fly on into my Avatar.\n\nThe tempting move — attacking the Foot Soldiers with the Warriors — clears my blocker but leaves your own 5-power minion standing in the line of fire, where it soaks up all three bolts.`,
    line: (t) => (ready(t, 'war') && unit(t, 'war')!.x === 2 ? { t: 'moveAttack', unitId: t.ids.war, path: [at(1, 1)] } : cast(t, 'Firebolts', { extra: { direction: 'n' } })),
  },
  {
    id: 'the-right-tool', title: 'The right tool', stars: 1,
    story: `Your Avatar carries a **Toolbox**, and you have 4 mana. Two of my minions stand in a column between us.`,
    notes: `Toolbox: Sacrifice → the bearer may cast an Ordinary spell from your collection (you still pay for the spell). Click the collection button to see what's in yours.`,
    build: () => scene({ avatars: AV, spent: true, sites: [...HOME, ...KEEP], door: [1], carry: ['Toolbox'], collection: { Firebolts: 1, 'Heat Ray': 1, Overpower: 1, Hellhounds: 1 }, mana: 4, units: [
      U('sol', 1, 'Foot Soldiers', 2, 1), U('war', 1, 'Amazon Warriors', 2, 2), U('tro', 1, 'Cave Trolls', 1, 3)] }),
    hints: [`You only get one spell out of the Toolbox. Read all four.`, `Three small bolts will never get past a 5-power minion.`, `One spell in your collection is "piercing".`],
    solution: `Use the Toolbox to cast **Heat Ray** straight ahead. A *piercing* projectile doesn't stop at the first unit: it deals 2 damage to one unit at every location along its path — my Foot Soldiers, my Amazon Warriors, and then my Avatar.\n\nFirebolts stops at the first body it meets, and here there are two bodies in the way.`,
    line: (t) => {
      const p = mine(t)
      if (p?.kind === 'nameCard') return answer(t, 'Heat Ray')
      if (p) return answer(t, 'n')
      return { t: 'activate', sourceId: t.ids['carry:Toolbox'], ability: 'rummage' }
    },
  },
  {
    id: 'trapdoor', title: 'Trapdoor', stars: 1,
    story: `Two guards, two attackers — and my Cave Trolls are standing on what I think is a Valley. You know better: it is your face-down **Spike Trap**. You have 1 mana and an **Overpower** in hand.`,
    notes: `Spike Trap: Trap (1) → deal 3 damage to a unit here. Overpower (1): give an ally +2 power this turn.`,
    build: () => scene({ avatars: AV, spent: true, sites: [...HOME, ...KEEP_OPEN], traps: [['Spike Trap', 2, 2]], door: [1], hand: ['Overpower'], mana: 1, units: [
      U('sol', 0, 'Foot Soldiers', 3, 3), U('cat', 0, 'Snow Leopard', 3, 3), U('tro', 1, 'Cave Trolls', 2, 2), U('war', 1, 'Amazon Warriors', 1, 3)] }),
    hints: [`Each of my untapped guards can absorb one attack.`, `Making an attacker bigger doesn't make a defender go away.`, `You have exactly one mana, and two things it could buy.`],
    solution: `Spring the **Spike Trap**: 3 damage kills the Cave Trolls. Attack my Avatar with the **Foot Soldiers** — the Amazon Warriors must defend, and tap. Then the **Snow Leopard** attacks with nobody left to stop it.\n\nOverpower is the decoy. A defender doesn't need to win the fight to save its Avatar, only to show up — so two attackers against two defenders fails however strong they are. Remove a defender instead.`,
    line: (t) => (alive(t, 'tro') ? { t: 'activate', sourceId: siteOn(t, 2, 2)!.id, ability: 'trap:spring' } : ready(t, 'sol') ? hit(t, 'sol', [2, 3], 'foe') : hit(t, 'cat', [2, 3], 'foe')),
  },
  {
    id: 'sirens-call', title: "Siren's call", stars: 1,
    story: `Your only minion is a **Coy Nixie**, and my Avatar has a guard on each side. Your Avatar is spent for the turn.`,
    notes: `Coy Nixie: once on your turn, may force target nearby enemy to take a step towards her; tap that enemy.`,
    build: () => scene({ avatars: AV, spent: true, sites: [...HOME, ...KEEP], door: [1], units: [
      U('nix', 0, 'Coy Nixie', 1, 2), U('tro', 1, 'Cave Trolls', 1, 3), U('war', 1, 'Amazon Warriors', 3, 3)] }),
    hints: [`"Target nearby enemy" — not "target nearby minion".`, `A defender must be within one step of the fight.`, `There are two squares my Avatar could be pulled to. One of them is still guarded.`],
    solution: `The Nixie's ability can target my **Avatar**. Beckon it, and choose the square **in front of it** (not the one beside the Cave Trolls). There, both guards are a diagonal away — out of reach — and the Nixie simply steps in and attacks.\n\nPulling the Avatar onto the Cave Trolls' square fails: the Trolls defend.`,
    line: (t) => {
      const p = mine(t)
      if (p) return answer(t, { x: 2, y: 2 })
      const foe = unit(t, 'foe')!
      return foe.y === 3 ? { t: 'activate', sourceId: t.ids.nix, ability: 'beckon', targets: [t.ids.foe] } : hit(t, 'nix', [2, 2], 'foe')
    },
  },
  {
    id: 'hard-workers', title: 'Hard workers', stars: 2,
    story: `One guard against your two attackers looks like an easy win. But the guard is **Gnarled Laborers**. You have 1 mana and an **Overpower**.`,
    notes: `Gnarled Laborers (3 power): untaps the first time it takes damage each turn. Overpower (1): give an ally +2 power this turn.`,
    build: () => scene({ avatars: AV, spent: true, sites: [...HOME, ...KEEP], door: [1], hand: ['Overpower'], mana: 1, units: [
      U('sol', 0, 'Foot Soldiers', 2, 2), U('cat', 0, 'Snow Leopard', 1, 3), U('lab', 1, 'Gnarled Laborers', 3, 3)] }),
    hints: [`A defender that untaps can defend twice.`, `It only untaps if it is still alive.`, `Damage on a minion adds up over the turn — but your attackers die as they deal it.`],
    solution: `Cast **Overpower** on one attacker *first*, and attack with it: the Laborers must defend, take 3 or more damage in one hit, and die before their untap matters. The other attacker then walks in.\n\nAttack without the Overpower and the Laborers survive the first fight, untap, and defend again. They do die to the second attacker — but that was your last one.`,
    line: (t) => (inHand(t, 'Overpower') ? cast(t, 'Overpower', { targets: [t.ids.cat] }) : ready(t, 'cat') ? hit(t, 'cat', [2, 3], 'foe') : hit(t, 'sol', [2, 3], 'foe')),
  },
  {
    id: 'shifting-ground', title: 'Shifting ground', stars: 2,
    story: `My Avatar sits behind three guards, and your two attackers are two steps away. The "Valley" my Amazon Warriors are standing on is your face-down **Landslide**. You have 2 mana and an **Overpower**.`,
    notes: `Landslide: Trap (2) → swap this site with another adjacent site. Each site carries along whatever stands on it.`,
    build: () => scene({ avatars: AV, spent: true, sites: [...HOME, ...KEEP_OPEN], traps: [['Landslide', 2, 2]], door: [1], mana: 2, hand: ['Overpower'], units: [
      U('dog', 0, 'Hellhounds', 2, 1), U('cat', 0, 'Snow Leopard', 2, 1), U('war', 1, 'Amazon Warriors', 2, 2), U('tro', 1, 'Cave Trolls', 1, 3), U('lab', 1, 'Gnarled Laborers', 3, 3)] }),
    hints: [`You can't reach my Avatar. Could my Avatar come to you?`, `Sites can be swapped with everything on them.`, `After the swap, check which of my guards are still within one step of my Avatar.`],
    solution: `Spring the **Landslide** and swap it with **my Avatar's site**. The two sites trade places with their passengers: my Avatar arrives right in front of your minions, and my Amazon Warriors are carried to the back.\n\nNow the flank guards are a diagonal away and can't defend. The Warriors can — once. Attack with one minion (the Warriors defend), then with the other.`,
    line: (t) => {
      const p = mine(t)
      if (p) return answer(t, { x: 2, y: 3 })
      const foe = unit(t, 'foe')!
      if (foe.y === 3) return { t: 'activate', sourceId: siteOn(t, 2, 2)!.id, ability: 'trap:spring' }
      return ready(t, 'dog') ? hit(t, 'dog', [2, 2], 'foe') : hit(t, 'cat', [2, 2], 'foe')
    },
  },
  {
    id: 'cold-snap', title: 'Cold snap', stars: 2,
    story: `You are the **Frost Mage**, one step from my Amazon Warriors, with 6 mana, a **Frostbolt** and a **Shatter**. Your lone Snow Leopard is beside my Avatar — and so are two guards.`,
    notes: `Frost Mage: (2) → Encase target nearby minion in ice: it is disabled and takes no damage until your next turn. Frostbolt (3): shoot a 3-damage projectile. Shatter (1): destroy a nearby target artifact or disabled minion.`,
    build: () => scene({ avatars: ['Frost Mage', 'Elementalist'], spent: true, at: [[2, 1], null], sites: [[0, 'Spire', 2, 0], [0, 'Spire', 2, 1], [0, 'Stream', 1, 1], [0, 'Stream', 3, 1], [0, 'Spire', 1, 0], [0, 'Stream', 3, 0], ...KEEP], door: [1], hand: ['Frostbolt', 'Shatter'], mana: 6, units: [
      U('cat', 0, 'Snow Leopard', 3, 3), U('war', 1, 'Amazon Warriors', 2, 2), U('tro', 1, 'Cave Trolls', 1, 3)] }),
    hints: [`The Snow Leopard is not going to get through two guards.`, `2 + 1 + 3 = 6.`, `Ice makes a minion invulnerable to damage — and vulnerable to something else.`],
    solution: `Three spells, all six mana, no attack at all. **Encase** the Amazon Warriors: they are now disabled. **Shatter** destroys a disabled minion outright — the ice that protects them from damage is exactly what makes them breakable. With the column empty, **Frostbolt** flies straight into my Avatar.\n\nThe Snow Leopard was never part of it: one attacker against two guards goes nowhere.`,
    line: (t) => {
      const war = unit(t, 'war')
      if (war && !war.modifiers.some((m: any) => m.keyword === 'disabled')) return { t: 'activate', sourceId: t.ids.me, ability: 'encase', targets: [t.ids.war] }
      if (war) return cast(t, 'Shatter', { targets: [t.ids.war] })
      return cast(t, 'Frostbolt', { extra: { direction: 'n' } })
    },
  },
  {
    id: 'small-but-deadly', title: 'Small but deadly', stars: 3,
    story: `Three small attackers against two guards: my **Amazon Warriors** and my **Gnarled Laborers**. You have 1 mana and an **Overpower**. Your Plague Rat can't reach my Avatar this turn.`,
    notes: `Plague Rat (1 power): Lethal. Gnarled Laborers (3 power): untaps the first time it takes damage each turn. Overpower (1): give an ally +2 power this turn.`,
    build: () => scene({ avatars: AV, spent: true, sites: [...HOME, ...KEEP], door: [1], hand: ['Overpower'], mana: 1, units: [
      U('sol', 0, 'Foot Soldiers', 2, 2), U('cat', 0, 'Snow Leopard', 2, 2), U('rat', 0, 'Plague Rat', 1, 2),
      U('lab', 1, 'Gnarled Laborers', 3, 3), U('war', 1, 'Amazon Warriors', 1, 3)] }),
    hints: [`Count defences, not defenders: the Laborers may be good for two.`, `The Rat can't attack my Avatar. What can it attack?`, `Once the Warriors are gone, this is a puzzle you may have seen before.`],
    solution: `The Plague Rat can't reach my Avatar, but it can reach a **guard**. Attack the **Amazon Warriors** with it: Lethal kills them (the Rat dies too). I could defend the Warriors with my Avatar — which would be suicide.\n\nThat leaves the Gnarled Laborers, who can defend twice unless the first hit kills them. So cast **Overpower** on one attacker and send it in: the Laborers defend and die. The last attacker delivers the death blow.\n\nAny other order runs out of attackers: without the Rat's kill I have three defences against your two attacks.`,
    line: (t) => {
      if (alive(t, 'war') && ready(t, 'rat')) return hit(t, 'rat', [1, 3], 'war')
      if (inHand(t, 'Overpower')) return cast(t, 'Overpower', { targets: [t.ids.cat] })
      return ready(t, 'cat') ? hit(t, 'cat', [2, 3], 'foe') : hit(t, 'sol', [2, 3], 'foe')
    },
  },
]

/** when a fight has several enemies in it (a defender joined and my Avatar stayed), the striker's
 *  controller divides its damage: put it all on the Avatar if it is there, else on the first enemy */
function allocate(t: Tut): Action | null {
  const p = mine(t)
  if (p?.kind !== 'allocateDamage') return null
  const d = p.data as { strikerId: string; candidates: string[]; power: number }
  const target = d.candidates.includes(t.ids.foe) ? t.ids.foe : d.candidates[0]
  return answer(t, { strikerId: d.strikerId, allocation: { [target]: d.power } })
}

/** puzzles as single-step coached sessions */
export const PUZZLES: Lesson[] = DEFS.map((d) => ({
  id: `puzzle:${d.id}`,
  chapter: 'Puzzles',
  title: d.title,
  blurb: d.story.replace(/\*\*/g, ''),
  covers: [],
  build: d.build,
  steps: [{
    say: `${RULES}\n\n${d.story}${d.notes ? `\n\n*${d.notes}*` : ''}`,
    task: 'Win this turn.',
    done: (t) => t.g.winner === 0,
    solve: (t) => allocate(t) ?? d.line(t),
  }],
  outro: d.solution,
  puzzle: { stars: d.stars, hints: d.hints, solution: d.solution },
}))

export const puzzleById = (id: string): Lesson | undefined => PUZZLES.find((p) => p.id === id)
