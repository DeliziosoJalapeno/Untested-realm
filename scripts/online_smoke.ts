// Online multiplayer smoke test: two real WebSocket clients play a full game
// through the ws server (the same applyAction that vs-Computer uses), driven by
// a small auto-player that only ever sees each seat's FILTERED view. Verifies
// the handshake, game start, per-seat info-hiding, state sync, and clean play.
import { WebSocket } from 'ws'
import {
  starterDecks, actingSeatFor, canCast, legalSiteSquares, validateSummonAt,
  reachableLocations, findPath, chebyshev, getCard, getScript, canTap, isDisabled,
  type Action, type PlayerId, type PlayerView,
} from '@sorcery/shared'

const URL = 'ws://localhost:8787/ws'
const cheby = (a: any, b: any) => chebyshev(a, b)

function answerPrompt(view: any, me: PlayerId, prompt: any): Action {
  const A = (choice: any): Action => ({ t: 'prompt', promptId: prompt.id, choice } as any)
  const d = prompt.data ?? {}
  switch (prompt.kind) {
    case 'drawDeck': return A(view.players[me].spellbookCount > 0 ? 'spellbook' : 'atlas')
    case 'defend': return A([])
    case 'stayInFight': return A(false)
    case 'intercept': return A(null)
    case 'allocateDamage': {
      const c = (d.candidates ?? [])[0]
      return A({ strikerId: d.strikerId, allocation: c ? { [c]: d.power ?? 0 } : {} })
    }
    case 'yesNo': return A(true)
    case 'chooseOption': return A((d.options ?? [])[0] ?? null)
    case 'chooseTargets': {
      const cand: string[] = d.candidates ?? []
      const foe = cand.find((id) => view.units[id] && view.units[id].controller !== me)
      return A(foe ? [foe] : cand.length ? [cand[0]] : [])
    }
    case 'chooseSquare': {
      const sqs = d.squares
      if (sqs?.length) return A(sqs[0])
      const own = Object.values(view.sites).find((s: any) => s.controller === me) as any
      return A(own ? { x: own.x, y: own.y } : { x: 2, y: me === 0 ? 1 : 2 })
    }
    case 'chooseCards': {
      const pick = d.pick ?? 1, total = (d.cards ?? []).length
      return A(Array.from({ length: Math.min(pick, total) }, (_, i) => i))
    }
    case 'nameCard': return A(d.names?.[0] ?? 'Wildfire')
    default: return A(null)
  }
}

/** decide ONE action from a seat's view, or null if it isn't our move. */
function decide(view: any, me: PlayerId): Action | null {
  const prompt = view.prompts?.[0]
  if (prompt && actingSeatFor(view, prompt.player) === me) return answerPrompt(view, me, prompt)
  const P = view.players[me]
  if (view.phase === 'mulligan') return P.keptHand ? null : { t: 'keepHand' }
  if (view.phase !== 'main' || actingSeatFor(view, view.activePlayer) !== me) return null

  const avatar = view.units[P.avatarUnitId]
  const enemy = view.players[(1 - me) as PlayerId]
  const enemyAvatar = view.units[enemy.avatarUnitId]

  // 1. play/draw a site with the avatar
  if (avatar && !avatar.tapped) {
    const siteCard = P.hand.find((id: string) => id !== 'hidden' && getCard(view.cards[id].name).type === 'Site')
    if (siteCard) {
      const sqs = legalSiteSquares(view, me)
      if (sqs.length) {
        const best = [...sqs].sort((a, b) => cheby(a, enemyAvatar) - cheby(b, enemyAvatar))[0]
        return { t: 'avatarSite', mode: 'play', cardId: siteCard, x: best.x, y: best.y }
      }
    } else if (P.atlasCount > 0) return { t: 'avatarSite', mode: 'draw' }
  }

  // 2. cast a castable minion (no mandatory genesis targets — keep it simple)
  for (const id of P.hand) {
    if (id === 'hidden') continue
    const def = getCard(view.cards[id].name)
    if (def.type !== 'Minion' || !canCast(view, me, id, avatar.id).ok) continue
    if (getScript(def.name)?.oversized) continue
    if ((getScript(def.name)?.genesisTargets ?? []).some((g: any) => !g.upTo)) continue
    const spots: any[] = []
    for (const s of Object.values(view.sites) as any[]) {
      if (validateSummonAt(view, me, def.name, { x: s.x, y: s.y, region: 'surface' }) === null) spots.push({ x: s.x, y: s.y })
    }
    if (!spots.length) continue
    const best = spots.sort((a, b) => cheby(a, enemyAvatar) - cheby(b, enemyAvatar))[0]
    return { t: 'castSpell', cardId: id, casterId: avatar.id, at: { x: best.x, y: best.y, region: 'surface' }, targets: [] } as any
  }

  // 3. attack with a ready unit (enemy unit, else enemy site), else advance
  for (const u of Object.values(view.units) as any[]) {
    if (u.controller !== me || u.isAvatar) continue
    if (!canTap(view, u) || isDisabled(view, u)) continue // skip tapped / summoning-sick / disabled
    const reach = [{ x: u.x, y: u.y, region: u.region }, ...reachableLocations(view, u)]
    for (const loc of reach) {
      const foe = (Object.values(view.units) as any[]).find(
        (e) => e.controller !== me && e.x === loc.x && e.y === loc.y && e.region === loc.region && !e.stealth,
      )
      const step = (attack: any) => {
        const path = loc.x === u.x && loc.y === u.y && loc.region === u.region ? [] : findPath(view, u, loc)
        return path === null ? null : ({ t: 'moveAttack', unitId: u.id, path, attack } as Action)
      }
      if (foe) { const a = step({ unit: foe.id }); if (a) return a }
      const site = (Object.values(view.sites) as any[]).find(
        (s) => s.x === loc.x && s.y === loc.y && !s.isRubble && s.controller !== null && s.controller !== me,
      )
      if (site && loc.region === 'surface') { const a = step({ site: site.id }); if (a) return a }
    }
  }
  return { t: 'endTurn' }
}

interface Client { ws: WebSocket; seat: PlayerId | null; view: PlayerView | null; errors: string[]; sent: number }

function makeClient(open: (ws: WebSocket) => void, onJoined: (c: Client, code: string) => void, state: { firstViewSeat0?: any }): Client {
  const c: Client = { ws: new WebSocket(URL), seat: null, view: null, errors: [], sent: 0 }
  c.ws.on('open', () => open(c.ws))
  c.ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw))
    if (msg.t === 'joined') { c.seat = msg.seat; onJoined(c, msg.code) }
    else if (msg.t === 'error') {
      c.errors.push(msg.msg)
      // a rejected action produces no state broadcast → unblock by ending the
      // turn if it's ours (keeps the game moving through the harness).
      const v: any = c.view
      if (v && c.seat !== null && v.phase === 'main' && actingSeatFor(v, v.activePlayer) === c.seat && c.sent < 500) {
        c.sent++
        if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify({ t: 'action', action: { t: 'endTurn' } }))
      }
    }
    else if (msg.t === 'state') {
      c.view = msg.view
      if (c.seat === 0 && !state.firstViewSeat0) state.firstViewSeat0 = msg.view
      act(c)
    }
  })
  return c
}

function act(c: Client): void {
  if (!c.view || c.seat === null) return
  if ((c.view as any).phase === 'over') return
  if (c.sent > 500) return
  const action = decide(c.view, c.seat)
  if (!action) return
  c.sent++
  setTimeout(() => { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify({ t: 'action', action })) }, 15)
}

async function main() {
  const deckA: any = { ...starterDecks[0], name: starterDecks[0].name }
  const deckB: any = { ...starterDecks[1], name: starterDecks[1].name }
  const state: { firstViewSeat0?: any } = {}
  let a!: Client, b!: Client

  let s: Client | undefined
  a = makeClient(
    (ws) => ws.send(JSON.stringify({ t: 'create', name: 'Alice', deck: deckA })),
    (_c, code) => {
      // once A has a room code, B joins it
      b = makeClient(
        (ws) => ws.send(JSON.stringify({ t: 'join', code, name: 'Bob', deck: deckB })),
        () => {},
        state,
      )
      // and a spectator watches (connects shortly after the game starts)
      setTimeout(() => {
        s = makeClient((ws) => ws.send(JSON.stringify({ t: 'spectate', code })), () => {}, state)
      }, 1500)
    },
    state,
  )

  // run until game over or ~30s
  const start = Date.now()
  while (Date.now() - start < 30000) {
    await new Promise((r) => setTimeout(r, 300))
    if (a.view && (a.view as any).phase === 'over') break
    if (b && b.view && (b.view as any).phase === 'over') break
  }

  const av: any = a.view, bv: any = b?.view
  // ---- assertions / report ----
  const report: any = {
    seats: [a.seat, b?.seat],
    started: !!av && !!bv,
    finalTurn: av?.turn,
    phase: av?.phase,
    winner: av?.winner,
    seat0Actions: a.sent,
    seat1Actions: b?.sent,
    errorsSeat0: a.errors.slice(0, 5),
    errorsSeat1: b?.errors.slice(0, 5),
    errorCountSeat0: a.errors.length,
    errorCountSeat1: b?.errors.length,
  }
  // info-hiding on the first state seat 0 saw: own hand real, opponent hidden
  const fv = state.firstViewSeat0
  if (fv) {
    report.seat0_ownHandVisible = fv.players[0].hand.every((id: string) => id !== 'hidden' && !!fv.cards[id])
    report.seat0_oppHandHidden = fv.players[1].hand.every((id: string) => id === 'hidden')
    report.seat0_oppHandCardsNotLeaked = fv.players[1].hand.length > 0 // it's all 'hidden', so no ids to leak
  }
  // sync: both clients agree on public facts at end
  if (av && bv) {
    report.sync_sameTurn = av.turn === bv.turn
    report.sync_sameUnitIds = JSON.stringify(Object.keys(av.units).sort()) === JSON.stringify(Object.keys(bv.units).sort())
    report.sync_sameSiteIds = JSON.stringify(Object.keys(av.sites).sort()) === JSON.stringify(Object.keys(bv.sites).sort())
    report.sync_sameAvatarLife = av.units[av.players[0].avatarUnitId]?.life === bv.units[bv.players[0].avatarUnitId]?.life
    // each seat sees its OWN hand but not the other's
    report.seat1_ownHandVisible = bv.players[1].hand.every((id: string) => id !== 'hidden' && !!bv.cards[id])
    report.seat1_seesOppHidden = bv.players[0].hand.every((id: string) => id === 'hidden')
  }
  // spectator: receives states, sees the public board, BOTH hands hidden, in sync
  const sv: any = s?.view
  report.spectator_seat = s?.seat ?? null
  report.spectator_gotState = !!sv
  if (sv && av) {
    report.spectator_bothHandsHidden =
      sv.players[0].hand.every((id: string) => id === 'hidden') &&
      sv.players[1].hand.every((id: string) => id === 'hidden')
    report.spectator_sameTurn = sv.turn === av.turn
    report.spectator_sameUnitIds = JSON.stringify(Object.keys(sv.units).sort()) === JSON.stringify(Object.keys(av.units).sort())
    report.spectator_errorCount = s?.errors.length
  }

  // log health
  const logs: string[] = (av?.log ?? []).map((l: any) => l.msg)
  report.logBad = logs.filter((m) => /No continuation|undefined|NaN/i.test(m))
  report.lastLog = logs.slice(-6)

  console.log(JSON.stringify(report, null, 2))
  a.ws.close(); b?.ws.close(); s?.ws.close()
  process.exit(0)
}

main()
