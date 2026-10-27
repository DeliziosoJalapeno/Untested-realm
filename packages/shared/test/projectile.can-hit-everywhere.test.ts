// Every projectile uses the same "can this be hit" rule (projectileCanHit): Stealth, a Crawling
// Congregation's "projectiles fly over this and other adjacent allies", a minion swallowed inside a
// Brobdingnag Bullfrog… Fireball and
// Firebolts used a Stealth-only filter, so they hit what Magic Missiles flew over.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, castMagic, waiveThreshold, placeSite } from './helpers'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

function lane() {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  const av = avatarOf(g, 0) // shoots north (+y) along its column
  for (let y = av.y; y <= av.y + 3; y++) if (!Object.values(g.sites).some((s) => s.x === av.x && s.y === y)) placeSite(g, 0, 'Rustic Village', av.x, y)
  const shielded = summonCard(g, 1, 'Bone Jumble', av.x, av.y + 2)
  const congregation = summonCard(g, 1, 'Crawling Congregation', av.x, av.y + 3)
  return { g, av, shielded, congregation }
}

describe('projectiles fly over what projectileCanHit rules out', () => {
  for (const spell of ['Fireball', 'Firebolts', 'Magic Missiles']) {
    it(`${spell} flies over a minion next to a Crawling Congregation`, () => {
      const { g, shielded } = lane()
      castMagic(g, 0, spell, { extra: { direction: 'n' } })
      expect(g.units[shielded.id], 'the shielded Bone Jumble survives').toBeTruthy()
      expect(g.units[shielded.id].damage ?? 0, 'untouched').toBe(0)
    })
  }
})
