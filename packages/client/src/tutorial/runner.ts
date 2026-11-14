// The tutorial runner: pure functions shared by the app (which drives a lesson live) and the lesson
// test (which plays every lesson's scripted solution to prove it can be completed).
import { applyAction, type Action, type GameState } from '@sorcery/shared'
import { botAction, botNeedsToAct } from '../bot'
import type { Tut } from './scene'

export interface TStep {
  /** what the coach says. Paragraphs are separated by a blank line; **bold** is supported. */
  say: string | ((t: Tut) => string)
  /** the one thing to do now. Absent → a reading step, advanced with the Continue button. */
  task?: string
  /** CSS selectors of the things to look at / click (pulsed on the board) */
  spot?: (t: Tut) => string[]
  /** which of your actions are allowed during this step (default: anything) */
  ok?: (a: Action, t: Tut) => boolean
  /** what the coach says when you try something else */
  nope?: string
  /** the step is complete (required with `task`) */
  done?: (t: Tut) => boolean
  /** the position can no longer complete this step → offer a restart, with this explanation */
  lost?: (t: Tut) => string | null
  /** run once when the step begins (e.g. deal a card) */
  enter?: (t: Tut) => void
  /** the coach's own move when it is the coach's turn to act in the main phase (null → end turn) */
  foe?: (t: Tut) => Action | null
  /** does the coach defend / intercept during this step? (default: no — it lets your attack through) */
  foeDefends?: boolean
  /** the lesson test's next action for this step, given the current position (null → nothing to do) */
  solve?: (t: Tut) => Action | null
}

export interface Lesson {
  id: string
  chapter: string
  title: string
  /** one line for the lesson list */
  blurb: string
  /** rules covered, for the list */
  covers: string[]
  build: () => Tut
  steps: TStep[]
  /** shown when the lesson is complete */
  outro: string
  /** a free game: the coach plays for real (the normal computer opponent) and only comments */
  freePlay?: boolean
}

export const sayOf = (s: TStep, t: Tut): string => (typeof s.say === 'function' ? s.say(t) : s.say)

/** May you take this action now? Returns null when allowed, or the coach's reason. Answers to the
 *  game's own questions (draws, defending, choices) are always allowed. */
export function gate(lesson: Lesson, i: number, a: Action, t: Tut): string | null {
  const step = lesson.steps[i]
  if (!step || lesson.freePlay) return null
  if (a.t === 'prompt' || a.t === 'drawChoice' || a.t === 'concede' || a.t === 'judge') return null
  if (!step.task) return 'Read the note first, then press Continue.'
  if (step.ok && !step.ok(a, t)) return step.nope ?? `Not that just yet — ${lower(step.task)}`
  return null
}
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** the coach's next action (seat 1) when the game is waiting on it */
export function foeMove(lesson: Lesson, i: number, t: Tut): Action {
  const g = t.g
  if (lesson.freePlay) return botAction(g, 1)
  const prompt = g.prompts[0]
  const step = lesson.steps[i]
  if (prompt) {
    if (!step?.foeDefends && (prompt.kind === 'defend' || prompt.kind === 'intercept')) return { t: 'prompt', promptId: prompt.id, choice: [] }
    return botAction(g, 1)
  }
  return step?.foe?.(t) ?? { t: 'endTurn' }
}

/** apply the coach's move; a scripted move the engine rejects falls back to ending the turn */
export function runFoe(lesson: Lesson, i: number, t: Tut): Action {
  let a = foeMove(lesson, i, t)
  if (!applyAction(t.g, 1, a).ok) {
    a = t.g.prompts[0]?.player === 1 ? botAction(t.g, 1) : { t: 'endTurn' }
    if (!applyAction(t.g, 1, a).ok && !t.g.prompts.length) { a = { t: 'endTurn' }; applyAction(t.g, 1, a) }
  }
  return a
}

/** move past every completed task step; returns the new step index (steps.length = lesson complete) */
export function advance(lesson: Lesson, i: number, t: Tut): number {
  let n = i
  while (n < lesson.steps.length && lesson.steps[n].task && lesson.steps[n].done?.(t)) {
    n++
    lesson.steps[n]?.enter?.(t)
  }
  return n
}

/** the Continue button on a reading step */
export function next(lesson: Lesson, i: number, t: Tut): number {
  if (lesson.steps[i]?.task) return i
  lesson.steps[i + 1]?.enter?.(t)
  return advance(lesson, i + 1, t)
}

/** is the game waiting on the coach? The coach holds still while you are reading a note. */
export const coachToAct = (lesson: Lesson, i: number, g: GameState): boolean =>
  botNeedsToAct(g, 1) && (!!lesson.freePlay || !!lesson.steps[i]?.task)

/** Play a lesson start to finish from its scripted solution. Used by the lesson test; returns the
 *  step it got stuck on (with why), or null when the lesson completes. */
export function playThrough(lesson: Lesson): { stuck: number; why: string } | null {
  const t = lesson.build()
  lesson.steps[0]?.enter?.(t)
  let i = advance(lesson, 0, t)
  let guard = 0
  const settle = () => { for (let k = 0; k < 60 && coachToAct(lesson, i, t.g); k++) { runFoe(lesson, i, t); i = advance(lesson, i, t) } }
  settle()
  while (i < lesson.steps.length) {
    if (guard++ > (lesson.freePlay ? 5000 : 400)) return { stuck: i, why: 'too many actions' }
    const step = lesson.steps[i]
    if (!step.task) { i = next(lesson, i, t); settle(); continue }
    if (!step.done) return { stuck: i, why: 'task step without done()' }
    const lost = step.lost?.(t)
    if (lost) return { stuck: i, why: `lost: ${lost}` }
    const a = step.solve?.(t)
    if (!a) return { stuck: i, why: `no solution action (task: ${step.task})` }
    const why = gate(lesson, i, a, t)
    if (why) return { stuck: i, why: `solution blocked by the gate: ${why}` }
    const r = applyAction(t.g, 0, a)
    if (!r.ok) return { stuck: i, why: `solution rejected: ${JSON.stringify(a)} — ${r.error}` }
    i = advance(lesson, i, t)
    settle()
  }
  return null
}
