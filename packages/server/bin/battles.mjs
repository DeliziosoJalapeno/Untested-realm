#!/usr/bin/env node
// Operational check: "are there active battles right now?"
// Run it INSIDE the running container so it can reach the live server process:
//   docker exec <container> battles          # human-readable
//   docker exec <container> battles --json    # raw JSON
// It hits the server over loopback (127.0.0.1), which is what unlocks the full
// per-battle detail — that detail is refused to non-loopback (tunnel/browser)
// callers, so no token is needed.

const PORT = process.env.PORT ?? '8787'
const raw = process.argv.includes('--json')

const fmtAge = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`)
const fmtClock = (ms) => {
  if (ms == null) return '—'
  const t = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

try {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/status`)
  if (!res.ok) {
    console.error(`battles: server returned HTTP ${res.status}`)
    process.exit(2)
  }
  const s = await res.json()

  if (raw) {
    console.log(JSON.stringify(s, null, 2))
    process.exit(0)
  }

  console.log(
    `${s.activeBattles} active battle(s) · ${s.waitingRooms} waiting room(s) · ` +
      `${s.spectators} spectator(s) · ${s.totalRooms} room(s) total`,
  )

  if (!s.battles) {
    // detail is loopback-only; if we somehow queried non-locally we'd land here
    if (s.activeBattles > 0) console.log('(per-battle detail is available only from inside the container)')
    process.exit(0)
  }

  for (const b of s.battles) {
    const [p0, p1] = b.players.map((n, i) => (n == null ? '(empty)' : n + (b.connected[i] ? '' : ' [offline]')))
    const turnMark = (seat) => (b.waitingOn === seat ? '⏳' : '')
    const clocks = b.clockRemaining
      ? ` · clock ${fmtClock(b.clockRemaining[0])}/${fmtClock(b.clockRemaining[1])}`
      : ''
    console.log(
      `  [${b.code}] ${turnMark(0)}${p0} vs ${turnMark(1)}${p1}` +
        ` · turn ${b.turn} (${b.phase})` +
        (b.spectators ? ` · ${b.spectators} watching` : '') +
        `${clocks} · up ${fmtAge(b.ageSec)}` +
        (b.origin === 'battle' ? ' · matchmade' : '') +
        (b.public ? '' : ' · private'),
    )
  }
  if (s.waiting?.length) {
    console.log('waiting:')
    for (const w of s.waiting) console.log(`  [${w.code}] ${w.host ?? '(empty)'}${w.public ? '' : ' · private'} · up ${fmtAge(w.ageSec)}`)
  }
  process.exit(0)
} catch (e) {
  console.error(`battles: could not reach the server on port ${PORT} — is it running? (${e?.message ?? e})`)
  process.exit(1)
}
