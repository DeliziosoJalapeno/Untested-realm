// The Manor at Daperyll Hill: "Once on your turn, this may deal 3 damage to target enemy here to heal you 3."
// Any enemy occupying it — an Avatar stretched onto it by The Rack included — but not a Stealthed one. And
// (FAQ) the full 3 damage must be dealt to heal: reduced, prevented or redirected → no heal.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, placeSite, summonCard } from './helpers'
import { applyAction, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

function setup() {
  const g = newGame(); keepBoth(g)
  const p = g.activePlayer, q = (1 - p) as PlayerId
  fillSites(g, p)
  for (const s of Object.values(g.sites)) if (s.x === 2 && s.y === 2) delete g.sites[s.id]
  const manor = placeSite(g, p, 'The Manor at Daperyll Hill', 2, 2)
  for (const s of Object.values(g.sites)) if (s.controller === p && s.id !== manor.id) { s.name = 'Spire'; g.cards[s.cardId] = { ...g.cards[s.cardId], name: 'Spire' } as any }
  return { g, p, q, manor }
}
const myAvatar = (g: GameState, p: PlayerId) => g.units[g.players[p].avatarUnitId]
function feast(g: GameState, p: PlayerId, siteId: string, victim?: string): { ok: boolean; candidates?: string[] } {
  const r = applyAction(g, p, { t: 'activate', sourceId: siteId, ability: 'feast' })
  if (!r.ok) return { ok: false }
  const pr = g.prompts[0]
  const candidates = (pr?.data as any)?.candidates as string[]
  if (victim) expect(applyAction(g, p, { t: 'prompt', promptId: pr!.id, choice: [victim] }).ok).toBe(true)
  return { ok: true, candidates }
}

describe('The Manor at Daperyll Hill', () => {
  it('feeds on an enemy Avatar stretched onto it, and heals 3', () => {
    const { g, p, q, manor } = setup()
    const foe = myAvatar(g, q)
    foe.x = 2; foe.y = 1; foe.extraSquares = [{ x: 2, y: 2, region: 'surface' }]
    myAvatar(g, p).life = 15
    const lifeBefore = foe.life!
    const { candidates } = feast(g, p, manor.id, foe.id)
    expect(candidates).toEqual([foe.id])
    expect(g.units[foe.id].life).toBe(lifeBefore - 3)
    expect(myAvatar(g, p).life).toBe(18)
  })

  it('a Stealthed enemy can\'t be targeted', () => {
    const { g, p, q, manor } = setup()
    const sneak = summonCard(g, q, 'Bone Jumble', 2, 2)
    sneak.stealth = true
    expect(feast(g, p, manor.id).ok, 'nothing to target → not offered').toBe(false)
  })

  it('no heal when the damage is prevented (a Ward breaks instead)', () => {
    const { g, p, q, manor } = setup()
    const v = summonCard(g, q, 'Foot Soldier', 2, 2) // not Evil (Evil minions can't be warded)
    v.ward = true
    myAvatar(g, p).life = 15
    feast(g, p, manor.id, v.id)
    expect(g.units[v.id]?.ward, 'the ward broke instead').toBeFalsy()
    expect(g.units[v.id]?.damage ?? 0).toBe(0)
    expect(myAvatar(g, p).life, 'no heal').toBe(15)
  })

  it('a minion that takes the full 3 heals you, even if it dies', () => {
    const { g, p, q, manor } = setup()
    const v = summonCard(g, q, 'Bone Jumble', 2, 2)
    myAvatar(g, p).life = 15
    feast(g, p, manor.id, v.id)
    expect(g.units[v.id]).toBeUndefined()
    expect(myAvatar(g, p).life).toBe(18)
  })
})
