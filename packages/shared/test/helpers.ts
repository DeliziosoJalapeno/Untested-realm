import { createGame, applyAction, starterDecks, type Action, type GameState, type PlayerId } from '../src'

export function newGame(seed = 42, first: PlayerId = 0): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['Alice', 'Bob'], seed, first)
  // most engine tests set up their own board — opt out of the forced first-turn site
  // so keepBoth() opens straight into the main phase (see turn.ts afterDrawStep).
  g.players[0].firstSiteDone = true; g.players[1].firstSiteDone = true
  return g
}

/** apply an action and throw on error (tests should fail loudly) */
export function act(state: GameState, player: PlayerId, action: Action): void {
  const res = applyAction(state, player, action)
  if (!res.ok) throw new Error(`action ${action.t} failed: ${res.error}`)
}

/** apply an action expecting failure; returns the error */
export function actFail(state: GameState, player: PlayerId, action: Action): string {
  const res = applyAction(state, player, action)
  if (res.ok) throw new Error(`action ${action.t} unexpectedly succeeded`)
  return res.error!
}

/** both players keep their hands; game begins */
export function keepBoth(state: GameState): void {
  act(state, 0, { t: 'keepHand' })
  act(state, 1, { t: 'keepHand' })
}

/** answer the active prompt */
export function answer(state: GameState, choice: any): void {
  const prompt = state.prompts[0]
  if (!prompt) throw new Error('no active prompt')
  act(state, prompt.player, { t: 'prompt', promptId: prompt.id, choice })
}

/** put a specific card (by name) into a player's hand from anywhere in their decks, return its id */
export function fetchToHand(state: GameState, player: PlayerId, name: string): string {
  const p = state.players[player]
  for (const zone of [p.hand, p.spellbook, p.atlas]) {
    const idx = zone.findIndex((id) => state.cards[id].name === name)
    if (idx >= 0) {
      const id = zone[idx]
      if (zone !== p.hand) {
        zone.splice(idx, 1)
        p.hand.push(id)
      }
      return id
    }
  }
  throw new Error(`${name} not found in ${p.name}'s cards`)
}

/** give the player mana directly (test convenience) */
export function giveMana(state: GameState, player: PlayerId, n: number): void {
  state.players[player].mana += n
}

/** conjure a card instance from outside the decks straight into a hand */
export function injectToHand(state: GameState, player: PlayerId, name: string): string {
  const id = `ctest${state.nextId++}`
  state.cards[id] = { id, name, owner: player }
  state.players[player].hand.push(id)
  return id
}

/** put a REAL card's unit straight onto the board (no cast, no genesis) —
 *  for FAQ scenarios that start mid-game. Summoning sickness is waived. */
export function summonCard(
  state: GameState,
  player: PlayerId,
  name: string,
  x: number,
  y: number,
  region: import('../src').Region = 'surface',
): import('../src').UnitState {
  const cardId = `ctest${state.nextId++}`
  state.cards[cardId] = { id: cardId, name, owner: player }
  const unitId = `utest${state.nextId++}`
  const unit: import('../src').UnitState = {
    id: unitId, cardId, name, owner: player, controller: player,
    isAvatar: false, x, y, region, tapped: false, damage: 0,
    enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
  state.units[unitId] = unit
  return unit
}

/** give a unit a REAL artifact to carry (no cast, no genesis) */
export function giveArtifact(state: GameState, carrier: import('../src').UnitState, name: string): import('../src').ArtifactState {
  const cardId = `ctest${state.nextId++}`
  state.cards[cardId] = { id: cardId, name, owner: carrier.controller }
  const artId = `atest${state.nextId++}`
  const art: import('../src').ArtifactState = {
    id: artId, cardId, name, conjuredBy: carrier.controller,
    x: carrier.x, y: carrier.y, region: carrier.region, carriedBy: carrier.id, tapped: false,
  }
  state.artifacts[artId] = art
  carrier.carrying.push(artId)
  return art
}

/** cast a magic from an injected copy with full mana (targets are raw refs like 'u1' / 'sq:x,y,region') */
export function castMagic(
  state: GameState,
  player: PlayerId,
  name: string,
  opts: { targets?: string[]; at?: { x: number; y: number; region?: import('../src').Region }; casterId?: string; extra?: any } = {},
): void {
  const cardId = injectToHand(state, player, name)
  state.players[player].mana += 20
  const casterId = opts.casterId ?? state.players[player].avatarUnitId
  act(state, player, { t: 'castSpell', cardId, casterId, targets: opts.targets, at: opts.at, extra: opts.extra })
}

/** same as castMagic but expects the cast itself to be rejected */
export function castMagicFail(
  state: GameState,
  player: PlayerId,
  name: string,
  opts: { targets?: string[]; at?: { x: number; y: number; region?: import('../src').Region }; casterId?: string } = {},
): string {
  const cardId = injectToHand(state, player, name)
  state.players[player].mana += 20
  const casterId = opts.casterId ?? state.players[player].avatarUnitId
  return actFail(state, player, { t: 'castSpell', cardId, casterId, targets: opts.targets, at: opts.at })
}

/** waive elemental thresholds for this player this turn (test convenience) */
export function waiveThreshold(state: GameState, player: PlayerId): void {
  state.flow = state.flow ?? {}
  state.flow.noThreshold = { ...(state.flow.noThreshold ?? {}), [player]: state.turn }
}

/** drop a REAL site directly onto a square (no play action, no genesis) */
export function placeSite(state: GameState, player: PlayerId, name: string, x: number, y: number): import('../src').SiteState {
  const cardId = `ctest${state.nextId++}`
  state.cards[cardId] = { id: cardId, name, owner: player }
  const siteId = `stest${state.nextId++}`
  const site: import('../src').SiteState = {
    id: siteId, cardId, name, owner: player, controller: player, x, y, tapped: false, isRubble: false,
  }
  state.sites[siteId] = site
  return site
}
