// The tutorial series: every lesson must be completable on the real engine by following its own
// scripted solution, and the coach must hold the player to the step in hand.
import { describe, it, expect, vi } from 'vitest'
import { applyAction } from '@sorcery/shared'
import { LESSONS, matchAdvice } from '../src/tutorial/lessons'
import { playThrough, gate, advance, sayOf } from '../src/tutorial/runner'

describe('tutorial lessons', () => {
  it('has unique ids, and every task step can be checked and solved', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length)
    for (const l of LESSONS) {
      expect(l.steps.length, l.id).toBeGreaterThan(0)
      for (const s of l.steps) if (s.task) { expect(s.done, `${l.id}: ${s.task}`).toBeTypeOf('function'); expect(s.solve, `${l.id}: ${s.task}`).toBeTypeOf('function') }
    }
  })

  for (const l of LESSONS) {
    it(`"${l.title}" can be completed from its scripted solution`, () => {
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.42) // the free game deals from a fixed seed
      try { expect(playThrough(l)).toBeNull() } finally { rnd.mockRestore() }
    })
  }

  it('every step has something to say on its opening board', () => {
    for (const l of LESSONS.filter((x) => !x.freePlay)) {
      const t = l.build()
      for (const s of l.steps) expect(sayOf(s, t).length, l.id).toBeGreaterThan(20)
    }
  })

  it('the coach refuses actions that are not the step in hand, but always lets you answer the game', () => {
    const l = LESSONS.find((x) => x.id === 'realm')!
    const t = l.build()
    // step 0 is a note: nothing may be played yet
    expect(gate(l, 0, { t: 'endTurn' }, t)).toMatch(/Continue/)
    // step 2 asks for a site: ending the turn is refused, playing the site is allowed
    expect(gate(l, 2, { t: 'endTurn' }, t)).toBeTruthy()
    const play = l.steps[2].solve!(t)!
    expect(gate(l, 2, play, t)).toBeNull()
    expect(applyAction(t.g, 0, play).ok).toBe(true)
    expect(advance(l, 2, t)).toBe(3)
    // answers to the game's own questions are never blocked
    expect(gate(l, 0, { t: 'prompt', promptId: 'p1', choice: 'atlas' }, t)).toBeNull()
  })

  it('a trap lesson really plays a face-down trap and springs it', () => {
    const l = LESSONS.find((x) => x.id === 'traps')!
    const t = l.build()
    expect(applyAction(t.g, 0, l.steps[1].solve!(t)!).ok).toBe(true)
    const site = Object.values(t.g.sites).find((s) => s.x === 2 && s.y === 1)!
    expect(site.name).toBe('Valley') // disguised as the basic Earth site
    expect(site.trap?.realName).toBe('Spike Trap')
  })

  it('the free game gives advice for the opening hand', () => {
    const l = LESSONS.find((x) => x.freePlay)!
    const t = l.build()
    expect(t.g.phase).toBe('mulligan')
    expect(matchAdvice(t)).toMatch(/mulligan/i)
  })
})
