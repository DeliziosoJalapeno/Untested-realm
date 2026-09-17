// Online chess-clock flag-fall test: create a room with a tiny clock, both
// players keep their opening hand, then STALL. The player on the clock in the
// first main turn should run out of time and lose — enforced by the SERVER.
import { WebSocket } from 'ws'
import { starterDecks } from '@sorcery/shared'

const URL = 'ws://localhost:8787/ws'
const CLOCK = { base: 2500, inc: 0 } // 2.5s, no increment

interface C { ws: WebSocket; seat: number | null; view: any; errors: string[] }

function client(open: (ws: WebSocket) => void): C {
  const c: C = { ws: new WebSocket(URL), seat: null, view: null, errors: [] }
  c.ws.on('open', () => open(c.ws))
  c.ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw))
    if (msg.t === 'joined') c.seat = msg.seat
    else if (msg.t === 'error') c.errors.push(msg.msg)
    else if (msg.t === 'state') {
      c.view = msg.view
      // get past mulligan, then do NOTHING (stall on the clock)
      if (msg.view.phase === 'mulligan' && c.seat !== null && !msg.view.players[c.seat].keptHand) {
        c.ws.send(JSON.stringify({ t: 'action', action: { t: 'keepHand' } }))
      }
    }
  })
  return c
}

async function main() {
  const deckA: any = { ...starterDecks[0] }
  const deckB: any = { ...starterDecks[1] }
  let b: C | undefined
  const a = client((ws) => ws.send(JSON.stringify({ t: 'create', name: 'Alice', deck: deckA, clock: CLOCK })))
  // wait for the room code then join
  const code: string = await new Promise((res) => {
    a.ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.t === 'joined') res(m.code) })
  })
  b = client((ws) => ws.send(JSON.stringify({ t: 'join', code, name: 'Bob', deck: deckB })))

  await new Promise((r) => setTimeout(r, 6000)) // let a flag fall (base 2.5s)

  const av = a.view, bv = b?.view
  const report = {
    started: !!av && !!bv,
    finalPhase: av?.phase,
    winner: av?.winner,
    clockRemaining: av?.clock?.remaining,
    bothAgreeOver: av?.phase === 'over' && bv?.phase === 'over' && av?.winner === bv?.winner,
    flagLog: (av?.log ?? []).map((l: any) => l.msg).filter((m: string) => /out of time/i.test(m)),
    lastLog: (av?.log ?? []).map((l: any) => l.msg).slice(-4),
  }
  console.log(JSON.stringify(report, null, 2))
  a.ws.close(); b?.ws.close()
  process.exit(0)
}
main()
