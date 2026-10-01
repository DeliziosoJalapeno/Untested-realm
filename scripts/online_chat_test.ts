// Quick-chat relay: a seated player's canned phrase is relayed by the server to BOTH seats AND
// spectators, tagged with the sender's name (spectators send as 'spectator'). Spawns a real ws
// server and drives it with raw sockets — mirrors the shape the client's net.chat() sends.
import { spawn } from 'node:child_process'
import { WebSocket } from 'ws'
import { starterDecks } from '@sorcery/shared'

const PORT = 8795
const URL = `ws://localhost:${PORT}/ws`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface C {
  ws: WebSocket
  seat: number | null
  code: string
  chats: { from: string; msg: string }[]
}
function connect(onOpen: (ws: WebSocket) => void): C {
  const c: C = { ws: new WebSocket(URL), seat: null, code: '', chats: [] }
  c.ws.on('open', () => onOpen(c.ws))
  c.ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.t === 'joined') { c.seat = m.seat; c.code = m.code }
    // only count real player/spectator phrases, not 'system' notices
    if (m.t === 'chat' && m.from !== 'system') c.chats.push({ from: m.from, msg: m.msg })
  })
  return c
}
const sendJ = (ws: WebSocket, o: any) => ws.send(JSON.stringify(o))
async function until(fn: () => boolean, ms = 4000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(25) }
  return false
}
const sawFrom = (c: C, from: string, msg: string) => c.chats.some((x) => x.from === from && x.msg === msg)

async function main() {
  const server = spawn('npx tsx packages/server/src/index.ts', {
    env: { ...process.env, PORT: String(PORT), SORCERY_DB: `./.tmp-chat-${PORT}.db`, NODE_ENV: 'test' },
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
  await until(() => bob.seat !== null, 8000)
  const spec = connect((ws) => sendJ(ws, { t: 'spectate', code: alice.code }))
  await sleep(300)

  // Alice sends a phrase → every participant (incl. Alice) gets it, tagged 'Alice'
  sendJ(alice.ws, { t: 'chat', msg: 'gg' })
  await until(() => sawFrom(alice, 'Alice', 'gg') && sawFrom(bob, 'Alice', 'gg') && sawFrom(spec, 'Alice', 'gg'), 3000)
  check("Alice's phrase reaches both seats", sawFrom(alice, 'Alice', 'gg') && sawFrom(bob, 'Alice', 'gg'))
  check("Alice's phrase reaches the spectator", sawFrom(spec, 'Alice', 'gg'))

  // Bob replies → tagged 'Bob', reaches everyone
  sendJ(bob.ws, { t: 'chat', msg: 'that was a bug!' })
  await until(() => sawFrom(alice, 'Bob', 'that was a bug!') && sawFrom(bob, 'Bob', 'that was a bug!') && sawFrom(spec, 'Bob', 'that was a bug!'), 3000)
  check("Bob's reply reaches everyone, tagged Bob", sawFrom(alice, 'Bob', 'that was a bug!') && sawFrom(spec, 'Bob', 'that was a bug!'))

  // A spectator chats → tagged 'spectator'
  sendJ(spec.ws, { t: 'chat', msg: 'whoa!' })
  await until(() => sawFrom(alice, 'spectator', 'whoa!') && sawFrom(bob, 'spectator', 'whoa!'), 3000)
  check("a spectator's phrase is relayed as 'spectator'", sawFrom(alice, 'spectator', 'whoa!') && sawFrom(bob, 'spectator', 'whoa!'))

  for (const c of [alice, bob, spec]) try { c.ws.close() } catch {}
  server.kill()
  await sleep(200)
  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nALL PASS')
  process.exit(fail.length ? 1 : 0)
}
main()
