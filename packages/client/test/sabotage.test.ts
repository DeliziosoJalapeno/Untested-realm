// Courtesan Thaïs, vs-Computer: when the bot is forced to PILOT the human's turn, it
// plays it to sabotage the seat it controls. This is intentionally fringe — a couple
// of deterministic checks, NOT the full bot gauntlet.

import { describe, it, expect } from 'vitest'
import { createGame, starterDecks, type GameState, type PlayerId } from '@sorcery/shared'
import { botAction, sabotageMain } from '../src/bot'

/** seat 0's turn, but controlled (piloted) by seat 1 — i.e. the bot pilots the human. */
function piloted(): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['You', 'Computer'], 7, 0)
  g.phase = 'main'
  g.players[0].keptHand = true; g.players[1].keptHand = true
  g.activePlayer = 0
  g.flow = { ...(g.flow ?? {}), thaisActive: 0 } // seat 0 controlled by seat 1
  return g
}

function addMinion(g: GameState, owner: PlayerId, name: string, x: number, y: number): string {
  const cardId = `c${g.nextId++}`; (g.cards as any)[cardId] = { id: cardId, name, owner }
  const id = `u${g.nextId++}`
  ;(g.units as any)[id] = {
    id, cardId, name, owner, controller: owner, isAvatar: false, x, y, region: 'surface',
    tapped: false, damage: 0, enteredTurn: g.turn - 2, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
  return id
}

function giveArtifact(g: GameState, unitId: string, name: string): string {
  const u = (g.units as any)[unitId]
  const cardId = `c${g.nextId++}`; (g.cards as any)[cardId] = { id: cardId, name, owner: u.owner }
  const aid = `a${g.nextId++}`
  ;(g.artifacts as any)[aid] = { id: aid, cardId, name, conjuredBy: u.owner, x: u.x, y: u.y, region: u.region, carriedBy: unitId, tapped: false }
  u.carrying.push(aid)
  return aid
}

describe('Thaïs sabotage — the bot piloting the enemy plays against them', () => {
  it('botAction routes to sabotage when it is piloting the OTHER seat', () => {
    const g = piloted() // seat 0 active, bot (seat 1) decides
    const uid = addMinion(g, 0, 'Foot Soldier', 2, 1)
    const aid = giveArtifact(g, uid, 'Poisonous Dagger')

    const action = botAction(g, 1) // the bot (seat 1) is asked to act for seat 0's turn
    // rule 1: strip the controlled seat's equipment
    expect(action.t).toBe('drop')
    if (action.t === 'drop') {
      expect(action.unitId).toBe(uid)
      expect(action.artifactIds).toContain(aid)
    }
  })

  it('sabotageMain ends the turn when the controlled seat has nothing to sabotage with', () => {
    const g = piloted() // no foe minions/artifacts
    g.players[0].hand = []      // no magics to dump
    g.players[0].mana = 0       // ...and nothing to pay for one anyway
    g.units[g.players[0].avatarUnitId].tapped = true // avatar already acted → no move/attack
    const action = sabotageMain(g, 0, 1)
    expect(action.t).toBe('endTurn')
  })
})
