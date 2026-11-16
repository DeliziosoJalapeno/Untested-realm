// The engine report built from a finished game's replay, and the text handed to the written review.
import { describe, it, expect } from 'vitest'
import { createGame, applyAction, featuredDecks, type PlayerId } from '@sorcery/shared'
import { botAction, botNeedsToAct } from '../src/bot'
import { startReplay } from '../src/replay'
import { buildReport, reportText } from '../src/game_report'

function playedGame(seed: number) {
  const decks: [any, any] = [featuredDecks[0], featuredDecks[1]]
  const r = startReplay('bot', decks, ['You', 'Computer'], seed, 0, null, false)
  const g = createGame(decks, ['You', 'Computer'], seed, 0, null, { secondSeer: false })
  let n = 0
  while (g.winner === null && g.phase !== 'over' && n++ < 2500) {
    const s = ([0, 1] as PlayerId[]).find((x) => botNeedsToAct(g, x)); if (s === undefined) break
    const a = botAction(g, s)
    if (!applyAction(g, s, a).ok) break
    r.actions.push({ seat: s, action: a })
  }
  return { r, g }
}

describe('engine report', () => {
  it('replays the game exactly and lists every turn, the swings and the re-checks', async () => {
    const { r, g } = playedGame(4242)
    const rep = await buildReport(r, 1, { recheckMs: 150 })
    expect(rep.rejected).toBe(0)
    expect(rep.winner).toBe(g.winner)
    expect(rep.rows.length).toBeGreaterThan(6)
    expect(rep.rows.map((x) => x.turn)).toEqual([...rep.rows.map((x) => x.turn)].sort((a, b) => a - b))
    const last = rep.rows[rep.rows.length - 1]
    if (g.winner !== null) expect(Math.sign(last.score)).toBe(g.winner === 1 ? 1 : -1) // scored from the computer's seat
    expect(rep.swings.length).toBeGreaterThan(0)
    for (const s of rep.swings) expect(s.log.length).toBeGreaterThan(0)
    for (const c of rep.checks) { expect(rep.rows.find((x) => x.turn === c.turn)?.player).toBe(1); expect(c.engine.length).toBeGreaterThan(3) }
  }, 60_000)

  it('writes the summary the review reads, within its size limit', async () => {
    const { r, g } = playedGame(77)
    const rep = await buildReport(r, 1, { recheckMs: 0 })
    const text = reportText(r, rep, g.log.map((l) => l.msg), { difficulty: 'fast', plans: [{ turn: 2, plan: 'Develop and hold the middle.' }] })
    expect(text).toMatch(/TEMPO BY TURN/)
    expect(text).toMatch(/GAME LOG:/)
    expect(text).toMatch(/Develop and hold the middle/)
    expect(text.length).toBeLessThan(80_000)
    expect(rep.checks).toEqual([])
  }, 60_000)
})
