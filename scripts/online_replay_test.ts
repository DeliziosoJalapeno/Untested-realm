// Online replays are recorded SERVER-SIDE (the only party holding both decks + seed + the full action
// log) and handed to the two SEATED players at game-over, riding in synced state so it survives a
// reconnect. Spectators never get it. This spawns a real ws server, plays a game to a concede, and
// verifies: both seats receive the record, a spectator does not, and the record reconstructs EXACTLY
// to the finished game (same winner + over phase) by re-running createGame + the logged actions.
import { spawn } from 'node:child_process'
import { WebSocket } from 'ws'
import { starterDecks, createGame, applyAction, type GameState } from '@sorcery/shared'

const PORT = 8795
const URL = `ws://localhost:${PORT}/ws`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface C {
  ws: WebSocket
  seat: number | null
  token: string | null
  code: string
  state: any | null
  replay: any | null // last non-null replay seen on a state message
}

function connect(onOpen: (ws: WebSocket) => void): C {
  const c: C = { ws: new WebSocket(URL), seat: null, token: null, code: '', state: null, replay: null }
  c.ws.on('open', () => onOpen(c.ws))
  c.ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.t === 'joined') { c.seat = m.seat; c.token = m.token; c.code = m.code }
    if (m.t === 'state') { c.state = m; if (m.replay) c.replay = m.replay }
  })
  return c
}
const sendJ = (ws: WebSocket, o: any) => ws.send(JSON.stringify(o))
async function until(fn: () => boolean, ms = 4000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(25) }
  return false
}

/** rebuild the finished state from the record, exactly as the client's replay viewer would. */
function reconstruct(r: any): GameState {
  const g = createGame(r.decks, r.names, r.seed, r.firstPlayer, r.clock, { secondSeer: r.secondSeer })
  for (const { seat, action } of r.actions) { try { applyAction(g, seat, action) } catch { /* keep going */ } }
  return g
}

async function main() {
  const server = spawn('npx tsx packages/server/src/index.ts', {
    env: { ...process.env, PORT: String(PORT), SORCERY_DB: `./.tmp-replay-${PORT}.db`, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'], shell: true,
  })
  let up = false
  server.stdout.on('data', (d) => { if (String(d).includes('listening')) up = true })
  server.stderr.on('data', (d) => process.stderr.write(d))
  await until(() => up, 15000)

  const fail: string[] = []
  const check = (name: string, ok: boolean) => { if (!ok) fail.push(name); console.log(`${ok ? '✓' : '✗'} ${name}`) }

  const deckA: any = { ...starterDecks[0] }
  const deckB: any = { ...starterDecks[1] }

  const alice = connect((ws) => sendJ(ws, { t: 'create', name: 'Alice', deck: deckA }))
  await until(() => alice.code !== '')
  const bob = connect((ws) => sendJ(ws, { t: 'join', code: alice.code, name: 'Bob', deck: deckB }))
  const specta = connect((ws) => sendJ(ws, { t: 'spectate', code: alice.code }))
  await until(() => !!alice.state && !!bob.state, 8000)
  check('game started', !!alice.state && !!bob.state)

  // while the game is LIVE, no replay is delivered to anyone
  check('no replay delivered mid-game (seat)', alice.state?.replay == null && bob.state?.replay == null)

  // play out: both keep, then Alice (seat 0) concedes → Bob (seat 1) wins
  sendJ(alice.ws, { t: 'action', action: { t: 'keepHand' } })
  sendJ(bob.ws, { t: 'action', action: { t: 'keepHand' } })
  await until(() => alice.state?.view?.phase === 'main' && bob.state?.view?.phase === 'main', 8000)
  sendJ(alice.ws, { t: 'action', action: { t: 'concede' } })
  await until(() => alice.state?.view?.phase === 'over' && bob.state?.view?.phase === 'over', 4000)

  // both seated players now hold the finished record…
  await until(() => !!alice.replay && !!bob.replay, 3000)
  check('both seated players received the replay', !!alice.replay && !!bob.replay)
  // …and a spectator never does
  check('spectator got NO replay', specta.replay == null)

  const r = alice.replay
  check('record is an online replay', r?.mode === 'online' && r?.replayVersion === 1)
  check('record carries both decks + a seed', Array.isArray(r?.decks) && r.decks.length === 2 && typeof r?.seed === 'number')
  check('action log recorded (2 keeps + concede)', Array.isArray(r?.actions) && r.actions.length >= 3)
  check('records the winner (Bob = seat 1)', r?.winner === 1)
  check('both seats got the SAME record', alice.replay?.createdAt === bob.replay?.createdAt)

  // the crucial one: the log reconstructs EXACTLY to the finished game
  const rebuilt = reconstruct(r)
  check('reconstruction reaches game-over', rebuilt.phase === 'over')
  check('reconstruction yields the same winner', rebuilt.winner === r.winner)

  // survives a reconnect — the record rides in synced state, so a rejoining seat still gets it
  bob.ws.close(); await sleep(200)
  const bobR = connect((ws) => sendJ(ws, { t: 'rejoin', code: bob.code, token: bob.token }))
  await until(() => !!bobR.replay, 4000)
  check('reconnecting seat still receives the replay', !!bobR.replay && bobR.replay.createdAt === r.createdAt)

  for (const c of [alice, bob, bobR, specta]) try { c.ws.close() } catch {}
  server.kill()
  await sleep(200)
  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nALL PASS')
  process.exit(fail.length ? 1 : 0)
}
main()
