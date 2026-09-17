// Rematch handshake: after a game ends, BOTH seats are offered a rematch; both yes → the
// room returns to DECK SELECTION and a fresh game starts once both resubmit a deck. The offer
// rides in synced state (stateMsg) so it survives a reconnect. Spawns a real ws server + drives it.
import { spawn } from 'node:child_process'
import { WebSocket } from 'ws'
import { starterDecks } from '@sorcery/shared'

const PORT = 8793
const URL = `ws://localhost:${PORT}/ws`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface C {
  ws: WebSocket
  seat: number | null
  token: string | null
  code: string
  state: any | null      // last { view, rematchDeadline, rematchYou, rematchOpp, ... }
  lobby: boolean         // saw a rematchStart (back at deck selection)
}

function connect(onOpen: (ws: WebSocket) => void): C {
  const c: C = { ws: new WebSocket(URL), seat: null, token: null, code: '', state: null, lobby: false }
  c.ws.on('open', () => onOpen(c.ws))
  c.ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.t === 'joined') { c.seat = m.seat; c.token = m.token; c.code = m.code }
    if (m.t === 'state') { c.state = m; if (m.view && m.view.phase !== 'over') c.lobby = false }
    if (m.t === 'rematchStart') { c.lobby = true; c.state = null }
  })
  return c
}
const sendJ = (ws: WebSocket, o: any) => ws.send(JSON.stringify(o))
async function until(fn: () => boolean, ms = 4000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(25) }
  return false
}

async function toGameOver(a: C, b: C) {
  sendJ(a.ws, { t: 'action', action: { t: 'keepHand' } })
  sendJ(b.ws, { t: 'action', action: { t: 'keepHand' } })
  await until(() => a.state?.view?.phase === 'main' && b.state?.view?.phase === 'main', 8000)
  // Alice concedes → game over, Bob wins
  sendJ(a.ws, { t: 'action', action: { t: 'concede' } })
  await until(() => a.state?.view?.phase === 'over' && b.state?.view?.phase === 'over', 4000)
}

async function main() {
  const server = spawn('npx tsx packages/server/src/index.ts', {
    env: { ...process.env, PORT: String(PORT), SORCERY_DB: `./.tmp-rematch-${PORT}.db`, NODE_ENV: 'test' },
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

  // ---- happy path: offer → both yes → deck select → fresh game ----
  const alice = connect((ws) => sendJ(ws, { t: 'create', name: 'Alice', deck: deckA }))
  await until(() => alice.code !== '')
  const bob = connect((ws) => sendJ(ws, { t: 'join', code: alice.code, name: 'Bob', deck: deckB }))
  await until(() => !!alice.state && !!bob.state, 8000)
  check('game started', !!alice.state && !!bob.state)

  await toGameOver(alice, bob)
  check('both see game over', alice.state?.view?.phase === 'over' && bob.state?.view?.phase === 'over')
  check('both offered a rematch (deadline set)', alice.state?.rematchDeadline != null && bob.state?.rematchDeadline != null)

  // the offer survives a reconnect (rides in synced state)
  bob.ws.close(); await sleep(200)
  const bobR = connect((ws) => sendJ(ws, { t: 'rejoin', code: bob.code, token: bob.token }))
  await until(() => bobR.state != null, 4000)
  check('reconnecting player still sees the rematch offer', bobR.state?.rematchDeadline != null)

  // Alice votes yes first → Bob should see rematchOpp; not started yet
  sendJ(alice.ws, { t: 'rematchVote', yes: true })
  await until(() => bobR.state?.rematchOpp === true, 3000)
  check('one yes → opponent sees rematchOpp, game NOT restarted', bobR.state?.rematchOpp === true && bobR.state?.view?.phase === 'over')

  // Bob votes yes → both agreed → back to deck selection (rematchStart)
  sendJ(bobR.ws, { t: 'rematchVote', yes: true })
  const gotLobby = await until(() => alice.lobby && bobR.lobby, 3000)
  check('both yes → both returned to deck selection', gotLobby)

  // each submits a deck → fresh game starts
  alice.state = null; bobR.state = null
  sendJ(alice.ws, { t: 'rematchDeck', deck: deckA })
  await sleep(150)
  check('one deck submitted → game NOT started yet', alice.state == null && bobR.state == null)
  sendJ(bobR.ws, { t: 'rematchDeck', deck: deckB })
  const restarted = await until(() => alice.state?.view?.phase && alice.state.view.phase !== 'over' && bobR.state?.view?.phase && bobR.state.view.phase !== 'over', 6000)
  check('both decks in → a FRESH game started (not over)', restarted)
  check('fresh game has no winner', alice.state?.view?.winner == null)

  // ---- decline path: one "no" closes the offer for both ----
  const carol = connect((ws) => sendJ(ws, { t: 'create', name: 'Carol', deck: deckA }))
  await until(() => carol.code !== '')
  const dave = connect((ws) => sendJ(ws, { t: 'join', code: carol.code, name: 'Dave', deck: deckB }))
  await until(() => !!carol.state && !!dave.state, 8000)
  await toGameOver(carol, dave)
  check('decline: both offered', carol.state?.rematchDeadline != null && dave.state?.rematchDeadline != null)
  sendJ(dave.ws, { t: 'rematchVote', yes: false })
  const closed = await until(() => carol.state?.rematchDeadline == null && dave.state?.rematchDeadline == null, 3000)
  check('a "no" closes the offer for both', closed)

  for (const c of [alice, bobR, carol, dave]) try { c.ws.close() } catch {}
  server.kill()
  await sleep(200)
  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nALL PASS')
  process.exit(fail.length ? 1 : 0)
}
main()
