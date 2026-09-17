// LEGACY BOT — the pre-gang-kill-improvement snapshot of bot.ts, frozen as the
// arena benchmark. Only the two public entry points are renamed so both bots can
// coexist in one bundle. Do NOT modify this file's decision logic.
//
// This is the STRONGER successor to the original bot_legacy.ts: it includes the
// lethal scan, site attacks, activated abilities, aura casting, subsurface
// summoning, artifact placement, expansion-caster casting, and full prompt
// coverage — everything the new bot had before the gang-kill / defender-model
// improvements were added.

import {
  affinity,
  applyAction,
  avatarOf,
  canCast,
  canActivate,
  chebyshev,
  effAttack,
  effDefence,
  effKeywords,
  findPath,
  getCard,
  getScript,
  legalSiteSquares,
  reachableLocations,
  unitsAt,
  validateSummonAt,
  canTap,
  isDisabled,
  type Action,
  type GameState,
  type PlayerId,
  type UnitState,
  type SiteState,
  actingSeatFor,
} from '@sorcery/shared'

export function legacyBotNeedsToAct(state: GameState, me: PlayerId): boolean {
  if (state.phase === 'over') return false
  const prompt = state.prompts[0]
  if (prompt) return actingSeatFor(state, prompt.player) === me
  if (state.phase === 'mulligan') return !state.players[me].keptHand
  return actingSeatFor(state, state.activePlayer) === me && state.phase === 'main'
}

export function legacyBotAction(state: GameState, me: PlayerId): Action {
  const prompt = state.prompts[0]
  if (prompt && actingSeatFor(state, prompt.player) === me) return answerPrompt(state, prompt.player, prompt)
  if (state.phase === 'mulligan') return mulliganChoice(state, me)
  return mainPhase(state, state.activePlayer)
}

// ---------- small shared helpers ----------

const REGIONS = ['air', 'earth', 'fire', 'water'] as const

function enemyOf(me: PlayerId): PlayerId {
  return (1 - me) as PlayerId
}

function atLoc(u: UnitState, loc: { x: number; y: number; region: string }): UnitState {
  return { ...u, x: loc.x, y: loc.y, region: loc.region as any } as UnitState
}

function isLegal(state: GameState, me: PlayerId, action: Action): boolean {
  const needsCheck =
    (action.t === 'castSpell' && ((action.targets?.length ?? 0) > 0 || action.at != null)) ||
    (action.t === 'activate' && (action.targets?.length ?? 0) > 0)
  if (!needsCheck) return true
  let clone: GameState
  try {
    clone = structuredClone(state)
  } catch {
    return true
  }
  try {
    return applyAction(clone, me, action).ok
  } catch {
    return false
  }
}

function progressSig(s: GameState): string {
  const u = Object.values(s.units)
    .map((x) => `${x.id},${x.tapped ? 1 : 0},${x.damage},${x.x},${x.y},${x.region},${x.life ?? ''},${x.carriedBy ?? ''},${x.silenced ? 1 : 0}`)
    .sort()
    .join('|')
  const a = Object.values(s.artifacts)
    .map((x) => `${x.id},${x.tapped ? 1 : 0},${x.x},${x.y},${x.carriedBy ?? ''}`)
    .sort()
    .join('|')
  const pl = s.players
    .map((p) => `${p.mana},${p.hand.length},${p.cemetery.length},${p.banished.length},${Object.values(p.collection ?? {}).reduce((n, v) => n + (v as number), 0)}`)
    .join('/')
  return `${s.nextId}#${s.phase}#${s.winner ?? ''}#${Object.keys(s.sites).length}#${s.prompts?.length ?? 0}#${pl}#${u}#${a}`
}

function actionMakesProgress(state: GameState, me: PlayerId, action: Action): boolean {
  let clone: GameState
  try {
    clone = structuredClone(state)
  } catch {
    return true
  }
  try {
    if (!applyAction(clone, me, action).ok) return false
  } catch {
    return false
  }
  return progressSig(clone) !== progressSig(state)
}

// ---------- prompts ----------

function answerPrompt(state: GameState, me: PlayerId, prompt: any): Action {
  const answer = (choice: any): Action => ({ t: 'prompt', promptId: prompt.id, choice })

  switch (prompt.kind) {
    case 'drawDeck': {
      const p = state.players[me]
      const avatar = avatarOf(state, me)
      const handDefs = p.hand.map((id) => getCard(state.cards[id].name))
      const sitesInHand = handDefs.filter((d) => d.type === 'Site').length
      const canSpell = p.spellbook.length > 0
      const canSite = p.atlas.length > 0
      const mySites = Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble).length
      const hasCastableMinion = p.hand.some((id) => {
        const d = getCard(state.cards[id].name)
        return d.type === 'Minion' && canCast(state, me, id, avatar.id).ok
      })
      if (hasCastableMinion && canSpell) return answer('spellbook')
      const nearShort = handDefs.some((d) => d.type !== 'Site' && d.type !== 'Avatar' && nearlyCastable(state, me, d))
      if (canSite && sitesInHand === 0 && (nearShort || mySites < 2)) return answer('atlas')
      return answer(canSpell ? 'spellbook' : 'atlas')
    }
    case 'defend': {
      const attacker = state.units[prompt.data?.attackerId]
      const picks: string[] = []
      if (!attacker) return answer(picks)
      const atkPow = effAttack(state, attacker)
      const atkDef = effDefence(state, attacker) - attacker.damage
      const threatensAv = isAvatarThreatened(state, me, attacker)
      const cands = (prompt.data?.candidates ?? [])
        .map((id: string) => state.units[id])
        .filter(Boolean) as UnitState[]
      const ranked = [...cands].sort((a, b) => {
        const aSurv = effDefence(state, a) - a.damage > atkPow ? 0 : 1
        const bSurv = effDefence(state, b) - b.damage > atkPow ? 0 : 1
        if (aSurv !== bSurv) return aSurv - bSurv
        return effAttack(state, b) - effAttack(state, a)
      })
      let dealt = 0
      for (const u of ranked) {
        const survives = effDefence(state, u) - u.damage > atkPow
        if (threatensAv) {
          picks.push(u.id)
          dealt += effAttack(state, u)
          if (dealt >= atkDef) break
        } else if (survives && effAttack(state, u) > 0) {
          picks.push(u.id)
          dealt += effAttack(state, u)
          if (dealt >= atkDef) break
        }
      }
      return answer(picks)
    }
    case 'stayInFight': {
      const u = state.units[prompt.data?.unitId]
      if (!u) return answer(false)
      return answer(effAttack(state, u) >= 2 || effDefence(state, u) - u.damage >= 3)
    }
    case 'intercept': {
      const mover = state.units[prompt.data?.moverId]
      for (const id of prompt.data?.candidates ?? []) {
        const u = state.units[id]
        if (!u || !mover) continue
        const kills = effAttack(state, u) >= effDefence(state, mover) - mover.damage
        const survives = effDefence(state, u) - u.damage > effAttack(state, mover)
        if (kills && (survives || effAttack(state, mover) >= 4)) return answer(id)
      }
      return answer(null)
    }
    case 'allocateDamage': {
      const power: number = prompt.data?.power ?? 0
      const candidates: string[] = prompt.data?.candidates ?? []
      const units = candidates.map((id) => state.units[id]).filter(Boolean) as UnitState[]
      const nonAvatar = units.filter((u) => !u.isAvatar)
      const byValue = [...nonAvatar].sort((a, b) => {
        const aNeed = Math.max(1, effDefence(state, a) - a.damage)
        const bNeed = Math.max(1, effDefence(state, b) - b.damage)
        const aRatio = (effAttack(state, a) + 1) / aNeed
        const bRatio = (effAttack(state, b) + 1) / bNeed
        return bRatio - aRatio
      })
      const alloc: Record<string, number> = {}
      let left = power
      for (const u of byValue) {
        const need = Math.max(1, effDefence(state, u) - u.damage)
        if (need <= left) {
          alloc[u.id] = need
          left -= need
        }
      }
      if (left > 0 && units.length) {
        const dump = units.find((u) => u.isAvatar) ?? [...units].sort((a, b) => effAttack(state, b) - effAttack(state, a))[0]
        alloc[dump.id] = (alloc[dump.id] ?? 0) + left
      }
      return answer({ strikerId: prompt.data?.strikerId, allocation: alloc })
    }
    case 'yesNo':
      return answer(yesNoChoice(state, me, prompt))
    case 'chooseOption':
      return answer(chooseOptionChoice(state, me, prompt))
    case 'nameCard': {
      const opp = state.players[enemyOf(me)]
      const seen = opp?.cemetery?.map((id: string) => state.cards[id]?.name).filter(Boolean) ?? []
      return answer(seen[0] ?? prompt.data?.names?.[0] ?? 'Wildfire')
    }
    case 'chooseTargets': {
      const candidates: string[] = prompt.data?.candidates ?? prompt.data?.ids ?? []
      if (prompt.data?.upTo && candidates.length === 0) return answer([])
      const enemyUnit = candidates.find((id) => state.units[id] && state.units[id].controller !== me)
      if (enemyUnit) return answer([enemyUnit])
      const enemySite = candidates.find((id) => state.sites[id] && state.sites[id].controller !== me)
      if (enemySite) return answer([enemySite])
      const allyUnits = candidates
        .map((id) => state.units[id])
        .filter((u) => u && u.controller === me) as UnitState[]
      if (allyUnits.length) return answer([allyUnits.sort((a, b) => effAttack(state, b) - effAttack(state, a))[0].id])
      if (prompt.data?.upTo) return answer([])
      return answer(candidates.length ? [candidates[0]] : [])
    }
    case 'chooseSquare': {
      const only: { x: number; y: number }[] | undefined = prompt.data?.squares
      if (only?.length) {
        const own = only.find((c) => Object.values(state.sites).some((s) => s.controller === me && s.x === c.x && s.y === c.y))
        return answer(own ?? only[0])
      }
      const own = Object.values(state.sites).find((s) => s.controller === me)
      return answer(own ? { x: own.x, y: own.y } : { x: 2, y: me === 0 ? 1 : 2 })
    }
    case 'chooseCards': {
      const pick: number = prompt.data?.pick ?? 1
      const total: number = (prompt.data?.cards ?? []).length
      if (total === 0) return answer([])
      return answer(Array.from({ length: Math.min(pick, total) }, (_, i) => i))
    }
    case 'orderCards': {
      const cards: string[] = prompt.data?.cards ?? []
      const labels: string[] = prompt.data?.labels ?? []
      const place: string = prompt.data?.place ?? 'resolve'
      const n = cards.length
      if (n <= 1) return answer(Array.from({ length: n }, (_, i) => i))
      const scoreEntry = (i: number): number => {
        const text = `${cards[i] ?? ''} ${labels[i] ?? ''}`.toLowerCase()
        let s = 0
        if (/(damage|strike|kill|destroy|burn|bolt|fire|slay|banish)/.test(text)) s += 100
        if (/(draw|search|tutor|conjure|summon)/.test(text)) s += 50
        if (/(heal|life|gain)/.test(text)) s += 30
        const def = getCardMaybe(cards[i])
        if (place === 'top' && def) s += Math.max(0, 12 - (def.cost ?? 0))
        return s
      }
      const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => scoreEntry(b) - scoreEntry(a))
      return answer(idx)
    }
    default:
      if (Array.isArray(prompt.data?.candidates) || prompt.data?.upTo) return answer([])
      return answer(null)
  }
}

function getCardMaybe(name: string): ReturnType<typeof getCard> | null {
  try {
    return getCard(name)
  } catch {
    return null
  }
}

function yesNoChoice(state: GameState, me: PlayerId, prompt: any): boolean {
  const t = String(prompt.title ?? '').toLowerCase()
  if (/(sacrifice|discard|lose life|pay \d+ life|banish your|destroy your)/.test(t)) {
    return boardAdvantage(state, me) > 3
  }
  if (/(draw|damage|deal|gain|summon|search|heal|untap|extra)/.test(t)) return true
  return true
}

function chooseOptionChoice(state: GameState, me: PlayerId, prompt: any): any {
  const options: any[] = prompt.data?.options ?? []
  if (!options.length) return null
  const score = (o: any): number => {
    const s = String(typeof o === 'string' ? o : o?.label ?? o?.name ?? '').toLowerCase()
    let v = 0
    if (/(damage|deal|kill|destroy|strike|burn)/.test(s)) v += 100
    if (/(draw|search|conjure|summon|tutor)/.test(s)) v += 60
    if (/(gain|heal|life|untap)/.test(s)) v += 30
    if (/(sacrifice|discard|lose)/.test(s)) v -= 40
    return v
  }
  return [...options].sort((a, b) => score(b) - score(a))[0]
}

function boardAdvantage(state: GameState, me: PlayerId): number {
  let mine = 0
  let theirs = 0
  for (const u of Object.values(state.units)) {
    if (u.isAvatar) continue
    const v = effAttack(state, u) + (effDefence(state, u) - u.damage)
    if (u.controller === me) mine += v
    else theirs += v
  }
  const myLife = avatarOf(state, me).life ?? 0
  const opLife = avatarOf(state, enemyOf(me)).life ?? 0
  return mine - theirs + (myLife - opLife)
}

function isAvatarThreatened(state: GameState, me: PlayerId, attacker: UnitState): boolean {
  const avatar = avatarOf(state, me)
  return chebyshev(attacker, avatar) <= 1
}

// ---------- mulligan ----------

function mulliganChoice(state: GameState, me: PlayerId): Action {
  const p = state.players[me]
  const sites = p.hand.filter((id) => getCard(state.cards[id].name).type === 'Site')
  const spells = p.hand.filter((id) => getCard(state.cards[id].name).type !== 'Site')
  if (sites.length === 0 && spells.length > 0) {
    return { t: 'mulligan', back: spells.slice(0, 3) }
  }
  const expensive = spells.filter((id) => (getCard(state.cards[id].name).cost ?? 0) >= 6)
  if (sites.length >= 2 && expensive.length >= 2) {
    return { t: 'mulligan', back: expensive.slice(0, 2) }
  }
  return { t: 'keepHand' }
}

// ---------- main phase ----------

function mainPhase(state: GameState, me: PlayerId): Action {
  const p = state.players[me]
  const avatar = avatarOf(state, me)
  const enemyAvatar = avatarOf(state, enemyOf(me))

  const lethal = lethalAction(state, me, avatar, enemyAvatar)
  if (lethal && isLegal(state, me, lethal)) return lethal

  const inHand = p.hand
    .map((id) => ({ id, def: getCard(state.cards[id].name) }))
    .filter(({ def }) => def.type !== 'Site' && def.type !== 'Avatar')

  if (!avatar.tapped) {
    const siteCards = p.hand.filter((id) => getCard(state.cards[id].name).type === 'Site')
    if (siteCards.length > 0) {
      const squares = legalSiteSquares(state, me)
      if (squares.length > 0) {
        const best = [...squares].sort((a, b) => chebyshev(a, enemyAvatar) - chebyshev(b, enemyAvatar))[0]
        return { t: 'avatarSite', mode: 'play', cardId: siteCards[0], x: best.x, y: best.y }
      }
    } else if (p.atlas.length > 0 && wantMoreSites(state, me, inHand, hasAnyCastable(state, me, inHand))) {
      return { t: 'avatarSite', mode: 'draw' }
    }
  }

  const castCandidates = collectCastable(state, me)
  const byCost = (a: CastCand, b: CastCand) => (b.def.cost ?? 0) - (a.def.cost ?? 0)
  const order = [
    ...castCandidates.filter((c) => c.def.type === 'Minion').sort(byCost),
    ...castCandidates.filter((c) => c.def.type !== 'Minion').sort(byCost),
  ]
  for (const cand of order) {
    const action = tryCast(state, me, cand)
    if (action && isLegal(state, me, action)) return action
  }

  const ab = tryActivateAbilities(state, me)
  if (ab && isLegal(state, me, ab)) return ab

  for (const u of Object.values(state.units)) {
    if (u.controller !== me || !canTap(state, u) || isDisabled(state, u)) continue
    const action = unitTurn(state, me, u, enemyAvatar)
    if (action) return action
  }

  if (avatar.deathsDoor && !isDisabled(state, avatar) && canTap(state, avatar)) {
    const here = avatarDanger(state, me, avatar)
    if (here > 0) {
      const safe = reachableLocations(state, avatar)
        .map((loc) => ({ loc, d: avatarDanger(state, me, loc) }))
        .sort((a, b) => a.d - b.d)[0]
      if (safe && safe.d < here) {
        const path = findPath(state, avatar, safe.loc)
        if (path && path.length) return { t: 'moveAttack', unitId: avatar.id, path }
      }
    }
  }

  if (!avatar.tapped && canTap(state, avatar) && !isDisabled(state, avatar) && p.atlas.length > 0) {
    return { t: 'avatarSite', mode: 'draw' }
  }

  return { t: 'endTurn' }
}

// ---------- lethal scan ----------

function enemyAvatarKillNeed(state: GameState, enemyAvatar: UnitState): number {
  if (enemyAvatar.deathsDoor) return 1
  return Math.max(1, effDefence(state, enemyAvatar) - enemyAvatar.damage)
}

function lethalAction(state: GameState, me: PlayerId, avatar: UnitState, enemyAvatar: UnitState): Action | null {
  const need = enemyAvatarKillNeed(state, enemyAvatar)
  const atDoor = !!enemyAvatar.deathsDoor

  for (const u of Object.values(state.units)) {
    if (u.controller !== me || !canTap(state, u) || isDisabled(state, u)) continue
    const kw = effKeywords(state, u)
    const pow = effAttack(state, u)
    if (pow < 1) continue
    if (kw.ranged && lineHitsEnemyAvatar(state, me, u, kw.ranged ?? 1)) {
      const dir = avatarShotDir(state, me, u, kw.ranged ?? 1)
      if (dir) return { t: 'activate', sourceId: u.id, ability: 'ranged', extra: { direction: dir } }
    }
    const ekw = effKeywords(state, enemyAvatar)
    if (ekw.airborne && !kw.airborne && enemyAvatar.region === 'surface') continue
    const reach = [{ x: u.x, y: u.y, region: u.region }, ...reachableLocations(state, u)]
    const spot = reach.find((loc) => loc.x === enemyAvatar.x && loc.y === enemyAvatar.y && loc.region === enemyAvatar.region)
    if (spot && (atDoor ? pow >= 1 : pow >= need)) {
      const path = spot.x === u.x && spot.y === u.y && spot.region === u.region ? [] : findPath(state, u, spot)
      if (path !== null) return { t: 'moveAttack', unitId: u.id, path, attack: { unit: enemyAvatar.id } }
    }
  }

  for (const cand of collectCastable(state, me)) {
    if (cand.def.type !== 'Magic') continue
    const script = getScript(cand.def.name)
    if (script?.shootsProjectile) {
      const caster = state.units[cand.casterId] ?? avatar
      const dir = bestProjectileDir(state, me, caster)
      if (dir && projectileHitsEnemyAvatar(state, me, caster, dir)) {
        return { t: 'castSpell', cardId: cand.id, casterId: cand.casterId, extra: { direction: dir }, targets: [] }
      }
      continue
    }
    if (looksLikeDamageSpell(cand.def) && script?.targets?.length) {
      const caster = state.units[cand.casterId] ?? avatar
      const targets = resolveTargetsPreferAvatar(state, me, script.targets, caster, enemyAvatar)
      if (targets) return { t: 'castSpell', cardId: cand.id, casterId: cand.casterId, targets }
    }
  }

  const dmgAbility = damageAbilityAtAvatar(state, me, enemyAvatar)
  if (dmgAbility) return dmgAbility

  return null
}

function looksLikeDamageSpell(def: ReturnType<typeof getCard>): boolean {
  return /(damage|deal \d|strike|deals? \d)/i.test(def.text)
}

function resolveTargetsPreferAvatar(
  state: GameState,
  me: PlayerId,
  specs: any[],
  caster: UnitState,
  enemyAvatar: UnitState,
): string[] | null {
  const targets: string[] = []
  let hitAvatar = false
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      if ((spec.owner === 'enemy' || spec.owner === 'any' || spec.owner === undefined) &&
          (spec.what === 'unit' || spec.what === 'avatar' || spec.what === 'minion')) {
        if (spec.what !== 'minion' && targetOk(state, me, spec, caster, enemyAvatar)) {
          targets.push(enemyAvatar.id)
          hitAvatar = true
          continue
        }
      }
      const pick = pickTargetFor(state, me, spec, caster)
      if (!pick) {
        if (spec.upTo) continue
        return null
      }
      targets.push(pick)
    }
  }
  return hitAvatar ? targets : null
}

function targetOk(state: GameState, me: PlayerId, spec: any, caster: UnitState, enemyAvatar: UnitState): boolean {
  if (spec.owner === 'ally') return false
  if (spec.targeted && (enemyAvatar.region !== caster.region || enemyAvatar.stealth)) return false
  if (spec.where === 'nearby' && chebyshev(enemyAvatar, caster) > 1) return false
  if (spec.where === 'adjacent' && chebyshev(enemyAvatar, caster) > 1) return false
  if (spec.where === 'here' && (enemyAvatar.x !== caster.x || enemyAvatar.y !== caster.y)) return false
  try {
    if (spec.filter && !spec.filter(state, enemyAvatar, caster)) return false
  } catch {
    return false
  }
  return true
}

// ---------- casting ----------

type CastCand = { id: string; def: ReturnType<typeof getCard>; casterId: string; casterIds: string[]; fromCemetery: boolean }

function collectCastable(state: GameState, me: PlayerId): CastCand[] {
  const p = state.players[me]
  const avatar = avatarOf(state, me)
  const out: CastCand[] = []
  const controlled = Object.values(state.units).filter((u) => u.controller === me && !isDisabled(state, u))

  const consider = (id: string, fromCemetery: boolean) => {
    const card = state.cards[id]
    if (!card) return
    const def = getCard(card.name)
    if (def.type === 'Site' || def.type === 'Avatar') return
    const casterIds: string[] = []
    if (canCast(state, me, id, avatar.id).ok) casterIds.push(avatar.id)
    const hasTargets = (getScript(def.name)?.targets?.length ?? 0) > 0 ||
      (getScript(def.name)?.genesisTargets?.length ?? 0) > 0 || def.type === 'Aura' || def.type === 'Minion'
    if (casterIds.length === 0 || hasTargets) {
      for (const u of controlled) {
        if (u.id === avatar.id) continue
        if (canCast(state, me, id, u.id).ok) casterIds.push(u.id)
      }
    }
    if (casterIds.length) out.push({ id, def, casterId: casterIds[0], casterIds, fromCemetery })
  }

  for (const id of p.hand) consider(id, false)
  for (const id of p.cemetery) {
    if (getScript(state.cards[id]?.name ?? '')?.castFromCemetery) consider(id, true)
  }
  return out
}

function hasAnyCastable(state: GameState, me: PlayerId, inHand: { def: any }[]): boolean {
  const avatar = avatarOf(state, me)
  const p = state.players[me]
  return p.hand.some((id) => {
    const d = getCard(state.cards[id].name)
    return d.type !== 'Site' && d.type !== 'Avatar' && canCast(state, me, id, avatar.id).ok
  })
}

function tryCast(state: GameState, me: PlayerId, cand: CastCand): Action | null {
  for (const casterId of cand.casterIds) {
    const action = tryCastWith(state, me, cand, casterId)
    if (action) return action
  }
  return null
}

function tryCastWith(state: GameState, me: PlayerId, cand: CastCand, casterId: string): Action | null {
  const avatar = avatarOf(state, me)
  const enemyAvatar = avatarOf(state, enemyOf(me))
  const caster = state.units[casterId] ?? avatar
  const name = cand.def.name
  const type = cand.def.type
  const script = getScript(name)

  if (type === 'Minion') {
    if (script?.oversized) return null
    return castMinion(state, me, cand, caster, avatar, enemyAvatar, casterId)
  }
  if (type === 'Artifact') return castArtifact(state, me, cand, caster, avatar, casterId)
  if (type === 'Aura') return castAura(state, me, cand, caster, casterId)
  if (type === 'Magic') {
    if (name === 'Chaos Twister') return null
    if (script?.shootsProjectile) {
      const dir = bestProjectileDir(state, me, caster)
      return dir ? { t: 'castSpell', cardId: cand.id, casterId, extra: { direction: dir }, targets: [] } : null
    }
    const specs = script?.targets ?? []
    if (specs.length === 0) return script?.onCast ? { t: 'castSpell', cardId: cand.id, casterId } : null
    const targets: string[] = []
    for (const spec of specs) {
      for (let i = 0; i < spec.count; i++) {
        const pick = pickTargetFor(state, me, spec, caster)
        if (!pick) {
          if (spec.upTo) continue
          return null
        }
        targets.push(pick)
      }
    }
    return { t: 'castSpell', cardId: cand.id, casterId, targets }
  }
  return null
}

function castMinion(
  state: GameState, me: PlayerId, cand: CastCand, caster: UnitState,
  avatar: UnitState, enemyAvatar: UnitState, casterId: string,
): Action | null {
  const name = cand.def.name
  const script = getScript(name)
  const canSubmerge = /(^|\n|\b)submerge\b/i.test(cand.def.text)
  const canBurrow = /(^|\n|\b)burrowing\b/i.test(cand.def.text)
  const subRegion: 'underwater' | 'underground' | null = canSubmerge ? 'underwater' : canBurrow ? 'underground' : null

  const surfaceSpots: { x: number; y: number; region: 'surface' }[] = []
  const subSpots: { x: number; y: number; region: 'underwater' | 'underground' }[] = []
  for (const s of Object.values(state.sites)) {
    if (validateSummonAt(state, me, name, { x: s.x, y: s.y, region: 'surface' }) === null)
      surfaceSpots.push({ x: s.x, y: s.y, region: 'surface' })
    if (subRegion && validateSummonAt(state, me, name, { x: s.x, y: s.y, region: subRegion }) === null)
      subSpots.push({ x: s.x, y: s.y, region: subRegion })
  }
  if (!surfaceSpots.length && !subSpots.length) return null

  const wantShield = avatar.deathsDoor
  const anchor = wantShield ? avatar : enemyAvatar
  const bestSurface = surfaceSpots.length
    ? [...surfaceSpots].sort((a, b) => chebyshev(a, anchor) - chebyshev(b, anchor))[0]
    : null

  let chosen: { x: number; y: number; region: 'surface' | 'underwater' | 'underground' } | null = bestSurface
  if (subRegion && subSpots.length) {
    const enemyHasSub = Object.values(state.units).some((u) => u.controller !== me && u.region === subRegion)
    const surfaceThreatened = bestSurface ? avatarDanger(state, me, bestSurface) >= 4 : true
    if (!wantShield && (surfaceThreatened || enemyHasSub || !bestSurface)) {
      chosen = [...subSpots].sort((a, b) => chebyshev(a, anchor) - chebyshev(b, anchor))[0]
    }
  }
  if (!chosen) chosen = subSpots.length ? subSpots.sort((a, b) => chebyshev(a, anchor) - chebyshev(b, anchor))[0] : null
  if (!chosen) return null

  const at = { x: chosen.x, y: chosen.y, region: chosen.region }
  const gt = script?.genesisTargets ?? []
  const atSpot = atLoc(caster, at)
  const targets: string[] = []
  for (const spec of gt) {
    if (spec.upTo) continue
    for (let i = 0; i < spec.count; i++) {
      const pick = pickTargetFor(state, me, spec, atSpot)
      if (!pick) return null
      targets.push(pick)
    }
  }
  return { t: 'castSpell', cardId: cand.id, casterId, at, targets }
}

function castArtifact(state: GameState, me: PlayerId, cand: CastCand, caster: UnitState, avatar: UnitState, casterId: string): Action | null {
  const name = cand.def.name
  const script = getScript(name)
  const subs = cand.def.subtypes ?? []
  const isGear = subs.includes('Weapon') || subs.includes('Armor')
  if (isGear) {
    const enemyAvatar = avatarOf(state, enemyOf(me))
    const minions = Object.values(state.units).filter(
      (u) => u.controller === me && !u.isAvatar && !isDisabled(state, u) && u.carrying.length < 2,
    )
    if (minions.length) {
      const best = [...minions].sort((a, b) => {
        const d = effAttack(state, b) - effAttack(state, a)
        if (d !== 0) return d
        return chebyshev(a, enemyAvatar) - chebyshev(b, enemyAvatar)
      })[0]
      return { t: 'castSpell', cardId: cand.id, casterId, extra: { giveTo: best.id } }
    }
  }
  const giveToAction: Action = { t: 'castSpell', cardId: cand.id, casterId, extra: { giveTo: avatar.id } }
  const groundOnly = subs.includes('Monument') || !!script?.conjureFilter
  if (groundOnly) {
    const enemyAvatar = avatarOf(state, enemyOf(me))
    const mySites = Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble)
    const spot = [...mySites].sort((a, b) => chebyshev(a, enemyAvatar) - chebyshev(b, enemyAvatar))[0]
    if (spot) return { t: 'castSpell', cardId: cand.id, casterId, at: { x: spot.x, y: spot.y } }
  }
  return giveToAction
}

function castAura(state: GameState, me: PlayerId, cand: CastCand, caster: UnitState, casterId: string): Action | null {
  const name = cand.def.name
  const hostile = isHostileAura(cand.def)
  const placement = getScript(name)?.auraPlacement
  const candidates: { x: number; y: number }[] = []
  for (let x = 0; x < 4; x++) {
    for (let y = 0; y < 3; y++) {
      if (placement) {
        try { if (placement(state, me, { x, y }) !== null) continue } catch { continue }
      }
      candidates.push({ x, y })
    }
  }
  if (!candidates.length) {
    for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) candidates.push({ x, y })
  }
  const density = (anchor: { x: number; y: number }, wantEnemy: boolean): number => {
    let n = 0
    for (let dx = 0; dx <= 1; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (const u of unitsAt(state, anchor.x + dx, anchor.y + dy)) {
          const isEnemy = u.controller !== me
          if (isEnemy === wantEnemy) n += 1 + (u.isAvatar ? 1 : 0)
        }
      }
    }
    return n
  }
  const best = [...candidates].sort((a, b) => density(b, hostile) - density(a, hostile))[0]
  if (!best) return null
  if (hostile && density(best, true) === 0) return null
  return { t: 'castSpell', cardId: cand.id, casterId, at: { x: best.x, y: best.y } }
}

function isHostileAura(def: ReturnType<typeof getCard>): boolean {
  return /(enemy|opponent|damage|each unit|all minions|weaker|-\d|cannot)/i.test(def.text) &&
    !/(your (units|minions)|allied|you control)/i.test(def.text)
}

function pickTargetFor(state: GameState, me: PlayerId, spec: any, caster: UnitState): string | null {
  if (spec.what === 'square') {
    let best: { x: number; y: number } | null = null
    let bestScore = 0
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 4; y++) {
        if (spec.targeted && chebyshev({ x, y }, caster) > 2) continue
        const at = unitsAt(state, x, y, caster.region)
        const enemies = at.filter((u) => u.controller !== me).length
        const allies = at.filter((u) => u.controller === me).length
        const hasEnemyAvatar = at.some((u) => u.isAvatar && u.controller !== me)
        const score = enemies - allies + (hasEnemyAvatar ? 5 : 0)
        if (score > bestScore) { bestScore = score; best = { x, y } }
      }
    }
    return best ? `sq:${best.x},${best.y},${caster.region}` : null
  }
  if (spec.what === 'site') {
    const pool = Object.values(state.sites).filter((s) => {
      if (s.isRubble) return false
      if (spec.owner === 'ally' && s.controller !== me) return false
      if (spec.owner === 'enemy' && (s.controller === me || s.controller === null)) return false
      if (spec.where === 'nearby' && chebyshev(s, caster) > 1) return false
      if (spec.where === 'adjacent' && chebyshev(s, caster) > 1) return false
      if (spec.where === 'here' && (s.x !== caster.x || s.y !== caster.y)) return false
      try { if (spec.filter && !spec.filter(state, s, caster)) return false } catch { return false }
      return true
    })
    if (!pool.length) return null
    const enemySite = pool.find((s) => s.controller !== null && s.controller !== me)
    return (enemySite ?? pool[0]).id
  }
  const candidates = (Object.values(state.units) as UnitState[]).filter((u) => {
    if (spec.what === 'minion' && u.isAvatar) return false
    if (spec.what === 'avatar' && !u.isAvatar) return false
    if (spec.owner === 'ally' && u.controller !== me) return false
    if (spec.owner === 'enemy' && u.controller === me) return false
    if (spec.targeted && (u.region !== caster.region || (u.stealth && u.controller !== me))) return false
    if (spec.where === 'nearby' && chebyshev(u, caster) > 1) return false
    if (spec.where === 'adjacent' && chebyshev(u, caster) > 1) return false
    if (spec.where === 'here' && (u.x !== caster.x || u.y !== caster.y)) return false
    try { if (spec.filter && !spec.filter(state, u, caster)) return false } catch { return false }
    return true
  })
  if (!candidates.length) return null
  if (spec.owner === 'ally') return candidates.sort((a, b) => effAttack(state, b) - effAttack(state, a))[0].id
  const enemies = candidates.filter((u) => u.controller !== me)
  if (enemies.length) {
    return enemies
      .map((u) => ({ u, s: scoreDamageTarget(state, me, u, 3) }))
      .sort((a, b) => b.s - a.s)[0].u.id
  }
  return candidates[0].id
}

// ---------- activated abilities ----------

function tryActivateAbilities(state: GameState, me: PlayerId): Action | null {
  const p = state.players[me]
  const enemyAvatar = avatarOf(state, enemyOf(me))

  type Src = { id: string; name: string; anchor: UnitState }
  const sources: Src[] = []
  for (const u of Object.values(state.units)) {
    if (u.controller === me) sources.push({ id: u.id, name: u.name, anchor: u })
  }
  for (const s of Object.values(state.sites)) {
    if (s.controller === me && !s.isRubble) sources.push({ id: s.id, name: s.name, anchor: siteAnchor(s, me) })
  }
  for (const a of Object.values(state.artifacts)) {
    const controller = a.carriedBy ? state.units[a.carriedBy]?.controller : a.conjuredBy
    if (controller === me) sources.push({ id: a.id, name: a.name, anchor: artifactAnchor(state, a, me) })
  }

  for (const src of sources) {
    const script = getScript(src.name)
    const abilities = script?.abilities ?? []
    for (const ability of abilities) {
      if (ability.key === 'ranged') continue
      if (ability.cost?.life || ability.cost?.sacrificeSelf || ability.cost?.discardSpell) continue
      const manaCost = ability.cost?.mana ?? 0
      if (manaCost > 0 && manaCost > p.mana) continue
      if (canActivate(state, me, src.id, ability.key) !== null) continue
      const action = buildAbilityAction(state, me, src.id, ability, src.anchor, enemyAvatar)
      if (action && actionMakesProgress(state, me, action)) return action
    }
  }
  return null
}

function buildAbilityAction(
  state: GameState, me: PlayerId, sourceId: string, ability: any,
  anchor: UnitState, enemyAvatar: UnitState,
): Action | null {
  const specs = ability.targets ?? []
  const label = `${ability.label ?? ''} ${ability.key ?? ''}`.toLowerCase()

  if (specs.length === 0) {
    if (/(draw|heal|token|summon|damage|untap|gain|conjure|charge|scry|search)/.test(label)) {
      const at = ability.needsSquare ? { x: anchor.x, y: anchor.y } : undefined
      return { t: 'activate', sourceId, ability: ability.key, targets: [], ...(at ? { at } : {}) }
    }
    return null
  }

  const wantsEnemy = specs.some((s: any) => s.owner === 'enemy' || s.owner === 'any' || s.owner === undefined)
  const targets: string[] = []
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      const pick = pickTargetFor(state, me, spec, anchor)
      if (!pick) {
        if (spec.upTo) continue
        return null
      }
      targets.push(pick)
    }
  }
  if (!targets.length) {
    if (!/(draw|heal|token|untap|gain)/.test(label)) return null
  }
  if (wantsEnemy && targets.length) {
    const hitsEnemy = targets.some((t) => {
      const u = state.units[t.startsWith('u') ? t : '']
      return u && u.controller !== me
    })
    const hitsSquareOrSite = targets.some((t) => t.startsWith('sq:') || state.sites[t])
    if (!hitsEnemy && !hitsSquareOrSite && !/(buff|ally|your)/.test(label)) {
      const allyBuff = specs.every((s: any) => s.owner === 'ally')
      if (!allyBuff) return null
    }
  }
  const at = ability.needsSquare ? { x: anchor.x, y: anchor.y } : undefined
  return { t: 'activate', sourceId, ability: ability.key, targets, ...(at ? { at } : {}) }
}

function damageAbilityAtAvatar(state: GameState, me: PlayerId, enemyAvatar: UnitState): Action | null {
  const p = state.players[me]
  const sources: { id: string; name: string; anchor: UnitState }[] = []
  for (const u of Object.values(state.units)) if (u.controller === me) sources.push({ id: u.id, name: u.name, anchor: u })
  for (const s of Object.values(state.sites)) if (s.controller === me && !s.isRubble) sources.push({ id: s.id, name: s.name, anchor: siteAnchor(s, me) })
  for (const a of Object.values(state.artifacts)) {
    const controller = a.carriedBy ? state.units[a.carriedBy]?.controller : a.conjuredBy
    if (controller === me) sources.push({ id: a.id, name: a.name, anchor: artifactAnchor(state, a, me) })
  }
  for (const src of sources) {
    const script = getScript(src.name)
    for (const ability of script?.abilities ?? []) {
      if (ability.key === 'ranged') continue
      if (ability.cost?.life || ability.cost?.sacrificeSelf) continue
      const manaCost = ability.cost?.mana ?? 0
      if (manaCost > p.mana) continue
      const label = `${ability.label ?? ''}`.toLowerCase()
      if (!/(damage|deal|strike|bolt|burn|shot|fire)/.test(label)) continue
      if (canActivate(state, me, src.id, ability.key) !== null) continue
      const specs = ability.targets ?? []
      const targets = resolveTargetsPreferAvatar(state, me, specs, src.anchor, enemyAvatar)
      if (targets) {
        const at = ability.needsSquare ? { x: src.anchor.x, y: src.anchor.y } : undefined
        return { t: 'activate', sourceId: src.id, ability: ability.key, targets, ...(at ? { at } : {}) }
      }
    }
  }
  return null
}

function siteAnchor(s: SiteState, me: PlayerId): UnitState {
  return { id: s.id, name: s.name, controller: me, isAvatar: false, x: s.x, y: s.y, region: 'surface', damage: 0, tapped: false, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as unknown as UnitState
}

function artifactAnchor(state: GameState, a: any, me: PlayerId): UnitState {
  if (a.carriedBy && state.units[a.carriedBy]) return state.units[a.carriedBy]
  return { id: a.id, name: a.name, controller: me, isAvatar: false, x: a.x, y: a.y, region: a.region ?? 'surface', damage: 0, tapped: false, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as unknown as UnitState
}

// ---------- unit turn ----------

function unitTurn(state: GameState, me: PlayerId, u: UnitState, enemyAvatar: UnitState): Action | null {
  const kw = effKeywords(state, u)
  const myPow = effAttack(state, u)
  const reach = [{ x: u.x, y: u.y, region: u.region }, ...reachableLocations(state, u)]
  const myAvatar = avatarOf(state, me)

  if (kw.ranged && myPow > 0) {
    let bestDir: 'n' | 's' | 'e' | 'w' | null = null
    let bestScore = 0
    for (const dir of ['n', 's', 'e', 'w'] as const) {
      const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
      const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
      for (let step = 1; step <= (kw.ranged ?? 1); step++) {
        const x = u.x + dx * step
        const y = u.y + dy * step
        if (x < 0 || x > 4 || y < 0 || y > 3) break
        const here = unitsAt(state, x, y, u.region).filter((t) => !t.stealth)
        if (here.length) {
          const enemy = here.find((t) => t.controller !== me)
          if (enemy) {
            const s = scoreDamageTarget(state, me, enemy, myPow)
            if (s > bestScore) { bestScore = s; bestDir = dir }
          }
          break
        }
      }
    }
    if (bestDir) return { t: 'activate', sourceId: u.id, ability: 'ranged', extra: { direction: bestDir } }
  }

  type Plan = { value: number; path: any[]; attack: any; killsEnemyAvatar: boolean }
  const bestRef: { cur: Plan | null } = { cur: null }
  const consider = (value: number, loc: any, attack: any, killsEnemyAvatar = false) => {
    if (value <= 0 || (bestRef.cur && value <= bestRef.cur.value)) return
    const path = loc.x === u.x && loc.y === u.y && loc.region === u.region ? [] : findPath(state, u, loc)
    if (path === null) return
    bestRef.cur = { value, path, attack, killsEnemyAvatar }
  }

  const myAvatarAtDoor = !!myAvatar.deathsDoor
  const cantAttackSites = !!getScript(u.name)?.cantAttackSites && !u.silenced
  for (const loc of reach) {
    for (const enemy of unitsAt(state, loc.x, loc.y, loc.region)) {
      if (enemy.controller === me || enemy.stealth) continue
      const ekw = effKeywords(state, enemy)
      if (ekw.airborne && !kw.airborne && enemy.region === 'surface') continue
      const eDef = effDefence(state, enemy) - enemy.damage
      const ePow = effAttack(state, enemy)
      if (enemy.isAvatar) {
        const deathBlow = enemy.deathsDoor ? myPow >= 1 : myPow >= eDef
        consider(deathBlow ? 100000 : Math.max(1, myPow) * 3, loc, { unit: enemy.id }, deathBlow)
        continue
      }
      // Original pre-improvement scoring: chip attacks allowed
      const kills = myPow >= eDef || !!kw.lethal
      const dies = ePow >= effDefence(state, u) - u.damage
      let value = kills && !dies ? ePow + 4 : kills && dies ? ePow - myPow * 0.5 + 2 : myPow >= 1 ? 1 : 0
      if (myAvatarAtDoor && kills && threatensAvatar(state, me, enemy)) value += 50
      consider(value, loc, { unit: enemy.id })
    }

    if (myPow > 0 && !cantAttackSites && loc.region === 'surface') {
      for (const site of Object.values(state.sites)) {
        if (site.isRubble || site.controller === null || site.controller === me) continue
        if (site.x !== loc.x || site.y !== loc.y) continue
        const value = scoreSiteAttack(state, me, u, site, loc, myPow)
        if (value > 0) consider(value, loc, { site: site.id })
      }
    }
  }

  const best = bestRef.cur
  if (best) {
    const threat = incomingThreat(state, me)
    const guardingHome = threat > 0 && !u.isAvatar && chebyshev(u, myAvatar) <= 1
    if (guardingHome && !best.killsEnemyAvatar && best.value < threat) return null
    if (u.isAvatar && !best.killsEnemyAvatar) {
      const dest = best.path.length ? best.path[best.path.length - 1] : { x: u.x, y: u.y }
      const danger = avatarDanger(state, me, dest)
      const myDef = effDefence(state, u) - u.damage
      const life = u.life ?? 0
      if (u.deathsDoor) return null
      if (danger >= myDef + life - 1) return null
    }
    return { t: 'moveAttack', unitId: u.id, path: best.path, attack: best.attack }
  }

  if (!u.isAvatar) {
    const closer = reach
      .filter((loc) => chebyshev(loc, enemyAvatar) < chebyshev(u, enemyAvatar))
      .filter((loc) => !Object.values(state.sites).some(
        (s) => s.x === loc.x && s.y === loc.y && !s.isRubble && s.controller !== null && s.controller !== me,
      ))
      .sort((a, b) => chebyshev(a, enemyAvatar) - chebyshev(b, enemyAvatar))[0]
    if (closer) {
      const path = findPath(state, u, closer)
      if (path && path.length) return { t: 'moveAttack', unitId: u.id, path }
    }
  }
  return null
}

function scoreSiteAttack(
  state: GameState, me: PlayerId, u: UnitState, site: SiteState,
  loc: { x: number; y: number }, myPow: number,
): number {
  const def = getCardMaybe(site.name)
  let denial = 2
  if (def) {
    for (const el of REGIONS) denial += (def.thresholds?.[el] ?? 0) * 2
    denial += 1
  }
  const lifeDrain = myPow * 3
  let retaliation = 0
  for (const e of Object.values(state.units)) {
    if (e.controller === me || isDisabled(state, e)) continue
    if (chebyshev(e, loc) <= 1) retaliation += Math.max(0, effAttack(state, e))
  }
  const myDef = effDefence(state, u) - u.damage
  const dies = retaliation >= myDef
  const value = lifeDrain + denial - (dies ? myPow + 4 : retaliation * 0.5)
  return Math.max(0, value)
}

function threatensAvatar(state: GameState, me: PlayerId, enemy: UnitState): boolean {
  const av = avatarOf(state, me)
  const mv = 1 + (effKeywords(state, enemy).movement ?? 0)
  if (chebyshev(enemy, av) <= mv + 1 && effAttack(state, enemy) > 0) return true
  const kw = effKeywords(state, enemy)
  return (!!kw.ranged || !!kw.spellcaster || enemy.isAvatar) && (enemy.x === av.x || enemy.y === av.y)
}

function avatarDanger(state: GameState, me: PlayerId, sq: { x: number; y: number }): number {
  let d = 0
  for (const e of Object.values(state.units)) {
    if (e.controller === me || isDisabled(state, e)) continue
    const mv = 1 + (effKeywords(state, e).movement ?? 0)
    if (chebyshev(e, sq) <= mv + 1) d += Math.max(1, effAttack(state, e))
    const kw = effKeywords(state, e)
    if ((kw.ranged || kw.spellcaster || e.isAvatar) && (Math.abs(e.x - sq.x) <= 1 || Math.abs(e.y - sq.y) <= 1)) d += 2
  }
  return d
}

function lineHitsEnemyAvatar(state: GameState, me: PlayerId, u: UnitState, range: number): boolean {
  return avatarShotDir(state, me, u, range) !== null
}

function avatarShotDir(state: GameState, me: PlayerId, u: UnitState, range: number): 'n' | 's' | 'e' | 'w' | null {
  const enemyAvatar = avatarOf(state, enemyOf(me))
  for (const dir of ['n', 's', 'e', 'w'] as const) {
    const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
    const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
    for (let step = 1; step <= range; step++) {
      const x = u.x + dx * step
      const y = u.y + dy * step
      if (x < 0 || x > 4 || y < 0 || y > 3) break
      const here = unitsAt(state, x, y, u.region).filter((t) => !t.stealth)
      if (here.length) {
        if (here.some((t) => t.isAvatar && t.controller !== me)) return dir
        break
      }
    }
  }
  return null
}

function bestProjectileDir(state: GameState, me: PlayerId, caster: UnitState): 'n' | 's' | 'e' | 'w' | null {
  let bestDir: 'n' | 's' | 'e' | 'w' | null = null
  let bestScore = 0
  for (const dir of ['n', 's', 'e', 'w'] as const) {
    const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
    const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
    let x = caster.x
    let y = caster.y
    for (;;) {
      x += dx; y += dy
      if (x < 0 || x > 4 || y < 0 || y > 3) break
      const here = unitsAt(state, x, y, caster.region).filter((u) => !u.stealth)
      if (here.length) {
        const impact = here.find((u) => u.controller !== me) ?? here[0]
        if (impact.controller !== me) {
          const s = scoreDamageTarget(state, me, impact, 3)
          if (s > bestScore) { bestScore = s; bestDir = dir }
        }
        break
      }
    }
  }
  return bestDir
}

function projectileHitsEnemyAvatar(state: GameState, me: PlayerId, caster: UnitState, dir: 'n' | 's' | 'e' | 'w'): boolean {
  const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
  const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
  let x = caster.x
  let y = caster.y
  for (;;) {
    x += dx; y += dy
    if (x < 0 || x > 4 || y < 0 || y > 3) break
    const here = unitsAt(state, x, y, caster.region).filter((u) => !u.stealth)
    if (here.length) return here.some((u) => u.isAvatar && u.controller !== me)
  }
  return false
}

function wantMoreSites(state: GameState, me: PlayerId, inHand: { def: any }[], haveCastablePlay: boolean): boolean {
  const mySites = Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble).length
  if (mySites < 3) return true
  if (haveCastablePlay) return false
  return inHand.some(({ def }) => nearlyCastable(state, me, def))
}

function nearlyCastable(state: GameState, me: PlayerId, def: any): boolean {
  if (def.type === 'Site' || def.type === 'Avatar') return false
  const p = state.players[me]
  const manaShort = (def.cost ?? 0) - p.mana
  if (manaShort > 1) return false
  const aff = affinity(state, me)
  let lack = 0
  for (const el of REGIONS) {
    lack += Math.max(0, (def.thresholds?.[el] ?? 0) - (aff[el] ?? 0))
  }
  return lack <= 1 && manaShort <= 1 && manaShort + lack >= 1
}

// ---------- damage targeting ----------

function ourUndefendedSites(state: GameState, me: PlayerId) {
  return Object.values(state.sites).filter(
    (s) => s.controller === me && !s.isRubble &&
      !Object.values(state.units).some((u) => u.controller === me && u.x === s.x && u.y === s.y),
  )
}

function onEnemySite(state: GameState, me: PlayerId, u: UnitState): boolean {
  return Object.values(state.sites).some(
    (s) => s.controller !== null && s.controller !== me && !s.isRubble && s.x === u.x && s.y === u.y,
  )
}

function threatensOurSites(state: GameState, me: PlayerId, enemy: UnitState): boolean {
  if (effAttack(state, enemy) <= 0) return false
  const mv = 1 + (effKeywords(state, enemy).movement ?? 0)
  return ourUndefendedSites(state, me).some((s) => chebyshev(enemy, s) <= mv)
}

// Original scoreDamageTarget — chip attacks on minions allowed (pre-improvement)
function scoreDamageTarget(state: GameState, me: PlayerId, target: UnitState, damage: number): number {
  if (target.controller === me) return 0
  const pow = Math.max(1, effAttack(state, target))
  if (target.isAvatar) {
    if (target.deathsDoor && damage >= 1) return 1_000_000
    return 5_000 + pow
  }
  const kills = damage >= effDefence(state, target) - target.damage
  if (kills && (onEnemySite(state, me, target) || threatensOurSites(state, me, target))) return 10_000 + pow
  if (kills) return 1_000 + pow
  return damage > 0 ? 100 + pow : 0
}

function incomingThreat(state: GameState, me: PlayerId): number {
  const myAv = avatarOf(state, me)
  let total = 0
  for (const u of Object.values(state.units)) {
    if (u.controller === me || u.isAvatar || isDisabled(state, u)) continue
    const mv = 1 + (effKeywords(state, u).movement ?? 0)
    if (chebyshev(u, myAv) <= mv + 1 && effAttack(state, u) > 0) total += effAttack(state, u)
  }
  return total
}
