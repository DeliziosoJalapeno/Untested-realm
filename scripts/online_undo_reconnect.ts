// Regression: a pending undo/editor REQUEST must survive the responder switching
// tabs / disconnecting / reconnecting. The ask rides in synced state (stateMsg), so
// on rejoin the responder still sees it. Spawns a real ws server and drives it.
import { spawn } from 'node:child_process'
import { WebSocket } from 'ws'
import { starterDecks } from '@sorcery/shared'

const PORT = 8791
const URL = `ws://localhost:${PORT}/ws`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface C {
  ws: WebSocket
  seat: number | null
  token: string | null
  code: string
  state: any | null // last { view, undoAsk, editorAsk, editorAllowed }
}

function connect(onOpen: (ws: WebSocket) => void): C {
  const c: C = { ws: new WebSocket(URL), seat: null, token: null, code: '', state: null }
  c.ws.on('open', () => onOpen(c.ws))
  c.ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.t === 'joined') { c.seat = m.seat; c.token = m.token; c.code = m.code }
    if (m.t === 'state') c.state = m
  })
  return c
}
const sendJ = (ws: WebSocket, o: any) => ws.send(JSON.stringify(o))
async function until(fn: () => boolean, ms = 4000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(25) }
  return false
}

async function main() {
  const server = spawn('npx tsx packages/server/src/index.ts', {
    env: { ...process.env, PORT: String(PORT), SORCERY_DB: `./.tmp-undo-${PORT}.db`, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })
  let up = false
  server.stdout.on('data', (d) => { if (String(d).includes('listening')) up = true })
  server.stderr.on('data', (d) => process.stderr.write(d))
  await until(() => up, 15000)

  const fail: string[] = []
  const check = (name: string, ok: boolean) => { if (!ok) fail.push(name); console.log(`${ok ? '✓' : '✗'} ${name}`) }

  const deckA: any = { ...starterDecks[0] }
  const deckB: any = { ...starterDecks[1] }

  // Alice creates, Bob joins → game starts
  const alice = connect((ws) => sendJ(ws, { t: 'create', name: 'Alice', deck: deckA }))
  await until(() => alice.code !== '')
  const bob = connect((ws) => sendJ(ws, { t: 'join', code: alice.code, name: 'Bob', deck: deckB }))
  await until(() => !!alice.state && !!bob.state, 8000)
  check('game started (both got state)', !!alice.state && !!bob.state)

  // keep hands to leave mulligan, then the active seat ends a turn so history is non-empty
  sendJ(alice.ws, { t: 'action', action: { t: 'keepHand' } })
  sendJ(bob.ws, { t: 'action', action: { t: 'keepHand' } })
  await until(() => alice.state?.view?.phase === 'main' && bob.state?.view?.phase === 'main', 8000)
  const activeSeat = alice.state.view.activePlayer
  const actor = activeSeat === alice.seat ? alice : bob
  sendJ(actor.ws, { t: 'action', action: { t: 'endTurn' } })
  await sleep(300)

  // --- UNDO: Alice requests, Bob (responder) disconnects, then rejoins ---
  bob.state = null
  sendJ(alice.ws, { t: 'undoRequest' })
  await until(() => bob.state?.undoAsk === 'Alice', 3000)
  check('responder sees undoAsk live', bob.state?.undoAsk === 'Alice')
  check('requester does NOT see the ask', alice.state?.undoAsk == null)

  // Bob "switches windows": socket drops, then he reconnects (rejoin)
  bob.ws.close()
  await sleep(200)
  const bob2 = connect((ws) => sendJ(ws, { t: 'rejoin', code: bob.code, token: bob.token }))
  const got = await until(() => bob2.state != null, 4000)
  check('reconnecting responder recovers undoAsk', got && bob2.state?.undoAsk === 'Alice')

  // resolving it clears the ask everywhere
  sendJ(bob2.ws, { t: 'undoReply', ok: false })
  await until(() => bob2.state?.undoAsk == null, 3000)
  check('undoAsk clears after reply', bob2.state?.undoAsk == null)

  // --- EDITOR: Alice requests, Bob disconnects, rejoins ---
  bob2.state = null
  sendJ(alice.ws, { t: 'editorRequest' })
  await until(() => bob2.state?.editorAsk === 'Alice', 3000)
  check('responder sees editorAsk live', bob2.state?.editorAsk === 'Alice')
  bob2.ws.close()
  await sleep(200)
  const bob3 = connect((ws) => sendJ(ws, { t: 'rejoin', code: bob.code, token: bob.token }))
  await until(() => bob3.state != null, 4000)
  check('reconnecting responder recovers editorAsk', bob3.state?.editorAsk === 'Alice')

  // grant → the requester's editorAllowed must survive its OWN reconnect
  sendJ(bob3.ws, { t: 'editorReply', ok: true })
  await until(() => alice.state?.editorAllowed === true, 3000)
  check('granted editorAllowed reaches requester', alice.state?.editorAllowed === true)
  alice.ws.close()
  await sleep(200)
  const alice2 = connect((ws) => sendJ(ws, { t: 'rejoin', code: alice.code, token: alice.token }))
  await until(() => alice2.state != null, 4000)
  check('reconnecting grantee keeps editorAllowed', alice2.state?.editorAllowed === true)

  for (const c of [alice, bob2, bob3, alice2]) try { c.ws.close() } catch {}
  server.kill()
  await sleep(200)
  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nALL PASS')
  process.exit(fail.length ? 1 : 0)
}
main()
