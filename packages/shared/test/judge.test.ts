import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, giveArtifact, summonCard, placeSite } from './helpers'
import { applyAction, avatarOf, siteAt, viewFor, parseKeywords, getCard, affinity, effKeywords, isSummoningSick, allCards, type JudgeOp } from '../src'

/** apply a judge op as player 0 and return the engine error (or null on success) */
function judge(state: ReturnType<typeof newGame>, op: JudgeOp): string | null {
  const r = applyAction(state, 0, { t: 'judge', op })
  return r.ok ? null : (r.error as string)
}

function ready(): ReturnType<typeof newGame> {
  const g = newGame()
  keepBoth(g)
  return g
}

describe('judge: summonUnit', () => {
  it('materializes a real card unit (not a token) and runs state-based checks', () => {
    const g = ready()
    const before = Object.keys(g.units).length
    expect(judge(g, { k: 'summonUnit', name: 'Foot Soldier', player: 1, x: 2, y: 2, region: 'surface' })).toBeNull()
    const ids = Object.keys(g.units)
    expect(ids.length).toBe(before + 1)
    const u = Object.values(g.units).find((u) => u.name === 'Foot Soldier' && u.owner === 1)!
    expect(u).toBeTruthy()
    expect(u.x).toBe(2)
    expect(u.y).toBe(2)
    expect(u.controller).toBe(1)
    expect(u.enteredTurn).toBe(g.turn)
    // a REAL card entry exists and is NOT a token
    const card = g.cards[u.cardId]
    expect(card.isToken).toBeUndefined()
    expect(card.owner).toBe(1)
  })

  it('rejects an unknown name', () => {
    const g = ready()
    expect(judge(g, { k: 'summonUnit', name: 'Not A Card', player: 0, x: 1, y: 1, region: 'surface' })).toMatch(/Unknown card/)
  })

  it('rejects a non-minion card name', () => {
    const g = ready()
    expect(judge(g, { k: 'summonUnit', name: 'Blessed Village', player: 0, x: 1, y: 1, region: 'surface' })).toMatch(/not a minion/)
  })

  it('void-banishes a non-voidwalk unit summoned into the void (state-based)', () => {
    const g = ready()
    expect(judge(g, { k: 'summonUnit', name: 'Foot Soldier', player: 0, x: 4, y: 3, region: 'void' })).toBeNull()
    // a plain Foot Soldier cannot survive the void: checkStateBased banishes it
    const alive = Object.values(g.units).some((u) => u.name === 'Foot Soldier' && u.region === 'void')
    expect(alive).toBe(false)
  })
})

describe('judge: placeSite', () => {
  it('places a real site with printed Ward and lifts void units', () => {
    const g = ready()
    expect(parseKeywords(getCard('Blessed Village').text).keywords.ward).toBe(true)
    // a unit sitting in the void at the target square
    const u = summonCard(g, 0, 'Foot Soldier', 1, 2, 'void')
    expect(judge(g, { k: 'placeSite', name: 'Blessed Village', player: 0, x: 1, y: 2 })).toBeNull()
    const s = siteAt(g, 1, 2)!
    expect(s.name).toBe('Blessed Village')
    expect(s.ward).toBe(true)
    expect(s.controller).toBe(0)
    // the sited square has no void — the unit was lifted to the surface
    expect(g.units[u.id].region).toBe('surface')
  })

  it('rejects placement on an occupied (non-rubble) square', () => {
    const g = ready()
    expect(judge(g, { k: 'placeSite', name: 'Blessed Village', player: 0, x: 3, y: 2 })).toBeNull()
    expect(judge(g, { k: 'placeSite', name: 'Accursed Desert', player: 0, x: 3, y: 2 })).toMatch(/already occupies/)
  })
})

describe('judge: spawnArtifact', () => {
  it('spawns a ground artifact', () => {
    const g = ready()
    expect(judge(g, { k: 'spawnArtifact', name: 'Excalibur', player: 0, x: 2, y: 1 })).toBeNull()
    const a = Object.values(g.artifacts).find((a) => a.name === 'Excalibur')!
    expect(a).toBeTruthy()
    expect(a.carriedBy).toBeNull()
    expect(a.conjuredBy).toBe(0)
    expect(a.x).toBe(2)
    expect(a.y).toBe(1)
  })

  it('gives an artifact to a unit and updates its carrying list', () => {
    const g = ready()
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1)
    expect(judge(g, { k: 'spawnArtifact', name: 'Excalibur', player: 0, x: 0, y: 0, giveTo: u.id })).toBeNull()
    const a = Object.values(g.artifacts).find((a) => a.name === 'Excalibur')!
    expect(a.carriedBy).toBe(u.id)
    expect(g.units[u.id].carrying).toContain(a.id)
    // carried artifact sits at the carrier's location, not the passed x/y
    expect(a.x).toBe(1)
    expect(a.y).toBe(1)
  })
})

describe('judge: addToHand / addToCemetery view-safety', () => {
  it('adds a site to a hand — named for the owner, hidden to the opponent', () => {
    const g = ready()
    expect(judge(g, { k: 'addToHand', name: 'Blessed Village', player: 0 })).toBeNull()
    const p0 = g.players[0]
    const newId = p0.hand[p0.hand.length - 1]
    expect(g.cards[newId].name).toBe('Blessed Village')

    // owner (seat 0) sees the card named in their own hand
    const mine = viewFor(g, 0)
    expect(mine.players[0].hand).toContain(newId)
    expect(mine.cards[newId]?.name).toBe('Blessed Village')

    // opponent (seat 1) sees only 'hidden' for that hand slot and does NOT get the card name
    const opp = viewFor(g, 1)
    expect(opp.players[0].hand).not.toContain(newId)
    expect(opp.players[0].hand).toContain('hidden')
    expect(opp.cards[newId]).toBeUndefined()
  })

  it('adds a card to a cemetery — public to both seats', () => {
    const g = ready()
    expect(judge(g, { k: 'addToCemetery', name: 'Abyssal Assault', player: 1 })).toBeNull()
    const id = g.players[1].cemetery[g.players[1].cemetery.length - 1]
    expect(g.cards[id].name).toBe('Abyssal Assault')
    for (const seat of [0, 1] as const) {
      const v = viewFor(g, seat)
      expect(v.players[1].cemetery).toContain(id)
      expect(v.cards[id]?.name).toBe('Abyssal Assault')
    }
  })
})

describe('judge: addToCollection', () => {
  it('adds a card to a player\'s collection pool, stacking copies', () => {
    const g = ready()
    expect(judge(g, { k: 'addToCollection', name: 'Fireball', player: 1 })).toBeNull()
    expect(g.players[1].collection['Fireball']).toBe(1)
    expect(judge(g, { k: 'addToCollection', name: 'Fireball', player: 1 })).toBeNull()
    expect(g.players[1].collection['Fireball']).toBe(2) // a second copy stacks
    expect(judge(g, { k: 'addToCollection', name: 'Not A Card', player: 1 })).toMatch(/Unknown card/)
  })
})

describe('judge: removeArtifact', () => {
  it('breaks an artifact and detaches it from its carrier', () => {
    const g = ready()
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1)
    const art = giveArtifact(g, u, 'Excalibur')
    expect(g.units[u.id].carrying).toContain(art.id)
    expect(judge(g, { k: 'removeArtifact', artifactId: art.id })).toBeNull()
    expect(g.artifacts[art.id]).toBeUndefined()
    expect(g.units[u.id].carrying).not.toContain(art.id)
    // the card lands in its owner's cemetery
    expect(g.players[0].cemetery).toContain(art.cardId)
  })
})

describe('judge: setLife / setMana', () => {
  it('sets absolute life and keeps death\'s-door bookkeeping', () => {
    const g = ready()
    expect(judge(g, { k: 'setLife', player: 1, value: 0 })).toBeNull()
    const av = avatarOf(g, 1)
    expect(av.life).toBe(0)
    expect(av.deathsDoor).toBe(true)
    expect(av.doorTurn).toBe(g.turn)
    // raising life back above 0 clears death's door
    expect(judge(g, { k: 'setLife', player: 1, value: 15 })).toBeNull()
    expect(avatarOf(g, 1).life).toBe(15)
    expect(avatarOf(g, 1).deathsDoor).toBe(false)
  })

  it('sets absolute mana (clamped at 0)', () => {
    const g = ready()
    expect(judge(g, { k: 'setMana', player: 0, value: 7 })).toBeNull()
    expect(g.players[0].mana).toBe(7)
    expect(judge(g, { k: 'setMana', player: 0, value: -5 })).toBeNull()
    expect(g.players[0].mana).toBe(0)
  })
})

describe('judge: threshold', () => {
  it('raises and lowers a single element\'s affinity, persistently and per-player', () => {
    const g = ready()
    // baseline: a fresh game grants no site affinity
    expect(affinity(g, 0)).toEqual({ air: 0, earth: 0, fire: 0, water: 0 })

    // +2 fire for player 0 accumulates across two ops
    expect(judge(g, { k: 'threshold', player: 0, element: 'fire', delta: 1 })).toBeNull()
    expect(judge(g, { k: 'threshold', player: 0, element: 'fire', delta: 1 })).toBeNull()
    expect(affinity(g, 0).fire).toBe(2)
    // other elements untouched, and the other player is unaffected
    expect(affinity(g, 0)).toEqual({ air: 0, earth: 0, fire: 2, water: 0 })
    expect(affinity(g, 1)).toEqual({ air: 0, earth: 0, fire: 0, water: 0 })

    // a negative delta shaves affinity; a total below zero clamps to 0
    expect(judge(g, { k: 'threshold', player: 0, element: 'fire', delta: -3 })).toBeNull()
    expect(affinity(g, 0).fire).toBe(0)
  })

  it('a negative override can suppress site-provided affinity down to zero', () => {
    const g = ready()
    // a fire site provides fire affinity to its controller
    placeSite(g, 0, 'Arid Desert', 0, 0)
    const provided = affinity(g, 0).fire
    expect(provided).toBeGreaterThan(0)
    // shave it back to zero with a matching negative override
    expect(judge(g, { k: 'threshold', player: 0, element: 'fire', delta: -provided })).toBeNull()
    expect(affinity(g, 0).fire).toBe(0)
  })
})

describe('judge: keyword add/remove', () => {
  it('grants then strips a movement keyword (visible via effKeywords)', () => {
    const g = ready()
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1)
    expect(effKeywords(g, g.units[u.id]).airborne).toBeFalsy()
    expect(judge(g, { k: 'keyword', unitId: u.id, keyword: 'airborne', duration: 'permanent' })).toBeNull()
    expect(effKeywords(g, g.units[u.id]).airborne).toBe(true)
    expect(judge(g, { k: 'keyword', unitId: u.id, keyword: 'airborne', duration: 'permanent', remove: true })).toBeNull()
    expect(effKeywords(g, g.units[u.id]).airborne).toBeFalsy()
  })

  it('strips a PRINTED keyword — Accursed Albatross loses Airborne', () => {
    const g = ready()
    const u = summonCard(g, 0, 'Accursed Albatross', 2, 2)
    expect(effKeywords(g, g.units[u.id]).airborne).toBe(true)
    expect(judge(g, { k: 'keyword', unitId: u.id, keyword: 'airborne', duration: 'permanent', remove: true })).toBeNull()
    expect(effKeywords(g, g.units[u.id]).airborne).toBeFalsy()
  })

  it('remove tolerates the parametric "ranged 1" form', () => {
    const g = ready()
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1)
    expect(judge(g, { k: 'keyword', unitId: u.id, keyword: 'ranged 1', duration: 'permanent' })).toBeNull()
    expect(effKeywords(g, g.units[u.id]).ranged).toBeTruthy()
    expect(judge(g, { k: 'keyword', unitId: u.id, keyword: 'ranged 1', duration: 'permanent', remove: true })).toBeNull()
    expect(effKeywords(g, g.units[u.id]).ranged).toBeFalsy()
  })
})

describe('judge: moveArtifact', () => {
  it('detaches a carried artifact and drops it on the chosen square', () => {
    const g = ready()
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1)
    const art = giveArtifact(g, u, 'Excalibur')
    expect(g.units[u.id].carrying).toContain(art.id)
    expect(judge(g, { k: 'moveArtifact', artifactId: art.id, x: 3, y: 2, region: 'surface' })).toBeNull()
    expect(g.artifacts[art.id].carriedBy).toBeNull()
    expect(g.units[u.id].carrying).not.toContain(art.id)
    expect(g.artifacts[art.id].x).toBe(3)
    expect(g.artifacts[art.id].y).toBe(2)
  })
})

describe('judge: setAvatar', () => {
  it("swaps a player's avatar identity, keeping its life and position", () => {
    const g = ready()
    const before = avatarOf(g, 0)
    const life = before.life
    const { x, y } = before
    const other = allCards.find((c) => c.type === 'Avatar' && c.name !== before.name)!.name
    expect(judge(g, { k: 'setAvatar', player: 0, name: other })).toBeNull()
    const after = avatarOf(g, 0)
    expect(after.name).toBe(other)
    expect(g.cards[after.cardId].name).toBe(other)
    expect(after.life).toBe(life)
    expect(after.x).toBe(x)
    expect(after.y).toBe(y)
  })

  it('rejects a non-avatar card', () => {
    const g = ready()
    expect(judge(g, { k: 'setAvatar', player: 0, name: 'Foot Soldier' })).toMatch(/not an avatar/)
  })
})

describe('judge: complete removal (site / artifact) and site ward', () => {
  it('destroySite toBanish clears the square (no rubble) and banishes the card', () => {
    const g = ready()
    const s = placeSite(g, 0, 'Blessed Village', 0, 0)
    expect(judge(g, { k: 'destroySite', siteId: s.id, toBanish: true })).toBeNull()
    expect(g.sites[s.id]).toBeUndefined()
    expect(siteAt(g, 0, 0)).toBeFalsy() // not even rubble
    expect(g.players[0].banished).toContain(s.cardId)
  })

  it('siteWard toggles a site ward on and off', () => {
    const g = ready()
    const s = placeSite(g, 0, 'Accursed Desert', 1, 0)
    expect(judge(g, { k: 'siteWard', siteId: s.id, on: true })).toBeNull()
    expect(g.sites[s.id].ward).toBe(true)
    expect(judge(g, { k: 'siteWard', siteId: s.id, on: false })).toBeNull()
    expect(g.sites[s.id].ward).toBeFalsy()
  })

  it('removeArtifact toBanish banishes the card instead of the cemetery', () => {
    const g = ready()
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1)
    const art = giveArtifact(g, u, 'Excalibur')
    expect(judge(g, { k: 'removeArtifact', artifactId: art.id, toBanish: true })).toBeNull()
    expect(g.artifacts[art.id]).toBeUndefined()
    expect(g.units[u.id].carrying).not.toContain(art.id)
    expect(g.players[0].banished).toContain(art.cardId)
    expect(g.players[0].cemetery).not.toContain(art.cardId)
  })
})

describe('judge: summoning sickness', () => {
  it('toggles summoning sickness on a minion; avatars are immune', () => {
    const g = ready()
    // a minion materialized THIS turn has summoning sickness
    expect(judge(g, { k: 'summonUnit', name: 'Foot Soldier', player: 0, x: 3, y: 3, region: 'surface' })).toBeNull()
    const u = Object.values(g.units).find((x) => x.name === 'Foot Soldier' && x.owner === 0)!
    expect(isSummoningSick(g, u)).toBe(true)
    // clear it
    expect(judge(g, { k: 'summonSick', unitId: u.id, on: false })).toBeNull()
    expect(isSummoningSick(g, u)).toBe(false)
    // re-add it
    expect(judge(g, { k: 'summonSick', unitId: u.id, on: true })).toBeNull()
    expect(isSummoningSick(g, u)).toBe(true)
    // avatars never have it and the op refuses them
    const av = avatarOf(g, 0)
    expect(judge(g, { k: 'summonSick', unitId: av.id, on: true })).toMatch(/Avatars never/)
    expect(isSummoningSick(g, av)).toBe(false)
  })
})

describe('judge: untap', () => {
  it('untaps all of a player\'s units, sites, and artifacts', () => {
    const g = ready()
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1)
    u.tapped = true
    const art = giveArtifact(g, u, 'Excalibur')
    art.tapped = true
    // player 0 controls a site — tap it
    const s = placeSite(g, 0, 'Accursed Desert', 0, 0)
    s.tapped = true
    expect(judge(g, { k: 'untap', player: 0 })).toBeNull()
    expect(g.units[u.id].tapped).toBe(false)
    expect(g.artifacts[art.id].tapped).toBe(false)
    expect(g.sites[s.id].tapped).toBe(false)
  })
})
