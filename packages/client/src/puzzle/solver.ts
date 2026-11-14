// "Win this turn" solver. An exhaustive minimax over the solver's own turn, built on the engine's
// legal-move generator: the solver's decisions are OR nodes (one winning move is enough), every
// answer the defender gets during that turn (defend, intercept, choices from its own cards) is an
// AND node (the line must win against all of them). Ending the turn is a loss.
//
// Used three ways: the puzzle test proves each puzzle is solvable and that its published line wins
// against the best defence; the live puzzle plays the defender with it (the defender picks an answer
// that refutes the attack whenever one exists); and puzzle authoring counts the winning first moves.
import { expandActions, type Action, type GameState, type PlayerId } from '@sorcery/shared'

export interface SolveResult {
  /** a forced win exists from this position */
  win: boolean
  /** positions examined */
  nodes: number
  /** the search hit its node budget before finishing: `win: false` is then "not proven" */
  capped: boolean
}

/** a position key: everything that decides what can still happen this turn (the log and clocks don't) */
function key(s: GameState): string {
  const { log, seed, ...rest } = s as any
  void log; void seed
  // two independent 53-bit hashes of the position: the full text of every position would not fit in
  // memory on a deep puzzle, and a 106-bit collision is not a practical concern
  const text = JSON.stringify(rest)
  return `${cyrb53(text, 1)}.${cyrb53(text, 0x9e3779b9)}`
}

function cyrb53(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** every line counts in a puzzle: minion Spellcasters may cast, and targeted abilities are tried */
const GEN = { minionCasters: true, abilityTargets: true }

export class Solver {
  nodes = 0
  capped = false
  private memo = new Map<string, boolean>()
  constructor(private me: PlayerId, private budget = 60000) {}

  /** is `s` a forced win for the solver before its turn ends? */
  wins(s: GameState): boolean {
    if (s.winner === this.me) return true
    if (s.winner !== null || s.phase === 'over') return false
    if (this.nodes >= this.budget) { this.capped = true; return false }
    const k = key(s)
    const hit = this.memo.get(k)
    if (hit !== undefined) return hit
    this.nodes++
    const prompt = s.prompts[0]
    const mover: PlayerId | null = prompt ? prompt.player : s.phase === 'main' && s.activePlayer === this.me ? this.me : null
    let result = false
    if (mover !== null) {
      const kids = expandActions(s, mover, GEN).filter((e) => mover !== this.me || this.useful(s, e.action))
      if (mover === this.me) result = this.ordered(kids).some((e) => this.wins(e.next))
      else result = kids.length > 0 && kids.every((e) => this.wins(e.next))
    }
    this.memo.set(k, result)
    return result
  }

  /** moves that can't be part of a win this turn are left out of the solver's own choices: passing,
   *  drawing a site, and — when the defender is already at Death's Door — attacking a site (life loss
   *  can never be the death blow) */
  private useful(s: GameState, a: Action): boolean {
    if (a.t === 'endTurn' || a.t === 'concede') return false
    if (a.t === 'avatarSite' && a.mode === 'draw') return false
    if (a.t === 'moveAttack' && a.attack && 'site' in a.attack) {
      const foe = s.units[s.players[this.me === 0 ? 1 : 0].avatarUnitId]
      if (foe?.deathsDoor) return false
    }
    return true
  }

  /** try the forcing moves first: attacks on the Avatar, then other attacks and spells, plain moves last */
  private ordered<T extends { action: Action; next: GameState }>(kids: T[]): T[] {
    const rank = (e: T): number => {
      if (e.next.winner === this.me) return 0
      const a = e.action
      if (a.t === 'prompt') return 1
      if (a.t === 'moveAttack') return a.attack ? 2 : 5
      if (a.t === 'castSpell' || a.t === 'activate') return 3
      return 4
    }
    return [...kids].sort((x, y) => rank(x) - rank(y))
  }

  /** the solver's moves from `s` that keep a forced win */
  winningMoves(s: GameState): Action[] {
    const mover = s.prompts[0] ? s.prompts[0].player : this.me
    if (mover !== this.me) return []
    return expandActions(s, this.me, GEN)
      .filter((e) => this.useful(s, e.action) && this.wins(e.next))
      .map((e) => e.action)
  }

  /** the defender's best answer to the open question: one after which the attack no longer wins by
   *  force, if there is one; otherwise null (every answer loses) */
  refutation(s: GameState): Action | null {
    const prompt = s.prompts[0]
    if (!prompt || prompt.player === this.me) return null
    for (const e of expandActions(s, prompt.player)) if (!this.wins(e.next)) return e.action
    return null
  }
}

export function solve(s: GameState, me: PlayerId, budget = 60000): SolveResult {
  const solver = new Solver(me, budget)
  const win = solver.wins(s)
  return { win, nodes: solver.nodes, capped: solver.capped }
}
