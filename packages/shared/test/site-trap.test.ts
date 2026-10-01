// Site traps: a Site played FACE-DOWN, disguised as the basic site of its element (Fire → Wasteland),
// that springs into its real self via an activated ability. The critical property is anti-cheat: the
// opponent (and spectators) must NEVER receive the real card — only the owner sees it — until it's sprung.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, giveMana, act } from './helpers'
import { enterSite, getCard, type GameState } from '../src'
import { viewFor } from '../src/engine/view'
import '../src/cards/scripts/index'

function playTrap(g: GameState, player: 0 | 1, name: string, x: number, y: number): string {
  const cid = `ctrap${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: player } as any
  return enterSite(g, player, cid, x, y)
}

describe('site trap — disguise, anti-cheat, and springing', () => {
  it('plays face-down as the basic site of its element and masquerades', () => {
    const g = newGame() as GameState; keepBoth(g)
    const manaBefore = g.players[0].mana
    const siteId = playTrap(g, 0, 'Ember Ambush', 2, 2)
    const s = g.sites[siteId]
    expect(s.name, 'stored as the Fire basic site').toBe('Wasteland')
    expect(s.trap?.element).toBe('fire')
    expect(s.trap?.realName).toBe('Ember Ambush')
    expect(g.players[0].mana - manaBefore, 'gives the basic site 1 mana').toBe(1)
    // it provides Fire threshold like a Wasteland while disguised (masquerade)
    expect(getCard(s.name).thresholds.fire).toBe(1)
  })

  it('ANTI-CHEAT: the opponent and spectators never receive the real card; the owner does', () => {
    const g = newGame() as GameState; keepBoth(g)
    const siteId = playTrap(g, 0, 'Ember Ambush', 2, 2)
    const cid = g.sites[siteId].cardId

    const owner = viewFor(g, 0)
    expect(owner.sites[siteId].name).toBe('Wasteland')
    expect(owner.sites[siteId].trap?.realName, 'the owner learns their own trap').toBe('Ember Ambush')
    expect(owner.cards[cid].name).toBe('Ember Ambush')

    for (const [who, v] of [['opponent', viewFor(g, 1)], ['spectator', viewFor(g, null)]] as const) {
      expect(v.sites[siteId].name, `${who} sees the disguise`).toBe('Wasteland')
      expect(v.sites[siteId].trap?.element, `${who} still knows it's a Fire trap`).toBe('fire')
      expect(v.sites[siteId].trap?.realName, `${who} must NOT learn the real name`).toBeUndefined()
      expect(v.cards[cid]?.name, `${who}'s card entry is the disguise`).toBe('Wasteland')
      // strongest guarantee: the real card name appears NOWHERE in the serialized projection
      expect(JSON.stringify(v).includes('Ember Ambush'), `${who}'s view leaks the trap`).toBe(false)
    }
  })

  it('springs via its activated ability: reveals to everyone, fires the effect, stays in play', () => {
    const g = newGame() as GameState; keepBoth(g)
    const siteId = playTrap(g, 0, 'Ember Ambush', 2, 2)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 3); foe.enteredTurn = -1 // nearby enemy
    giveMana(g, 0, 5)

    act(g, 0, { t: 'activate', sourceId: siteId, ability: 'trap:spring', targets: [foe.id] })

    const s = g.sites[siteId]
    expect(s.name, 'revealed to its real self').toBe('Ember Ambush')
    expect(s.trap, 'no longer face-down').toBeUndefined()
    expect(g.units[foe.id], 'the 3-damage spring killed the nearby enemy').toBeUndefined()
    expect(g.flow?.areaReveal?.name, 'the "trap activates" animation fired').toBe('trap activates: Ember Ambush')
    // now revealed to the opponent too
    expect(viewFor(g, 1).sites[siteId].name).toBe('Ember Ambush')
  })
})
