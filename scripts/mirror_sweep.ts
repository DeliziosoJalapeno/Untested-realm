// Sequential mirror-match sweep for the search bot.
//
//   20 batches × 8 mirror games. Search budget starts at 3s and grows +2s each batch
//   (batch 1 = 3000ms … batch 20 = 41000ms). Every output line is flushed to the log with a
//   SYNCHRONOUS append, so if the run is killed mid-sweep, all completed data is already on disk.
//
//   Run in the background:  npx tsx scripts/mirror_sweep.ts
//   Watch:                  Get-Content -Wait -Tail 40 mirror_sweep.log   (PowerShell)
//   Stop cleanly:           kill the mirror_sweep process (its per-batch child + workers exit with it).
import { spawn } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LOG = resolve(process.cwd(), 'mirror_sweep.log')
const GAMES = 8
const WORKERS = 4
const MAXTURN = 60
const BATCHES = 20
const BASE_MS = 3000
const STEP_MS = 2000

const write = (s: string) => { appendFileSync(LOG, s + '\n') } // synchronous → durable across a manual kill
const both = (s: string) => { write(s); process.stdout.write(s + '\n') }

writeFileSync(LOG, `=== MIRROR SWEEP started ${new Date().toISOString()} ===\n`)
both(`plan: ${BATCHES} batches × ${GAMES} games (${WORKERS} workers), searchMs ${BASE_MS}→${BASE_MS + (BATCHES - 1) * STEP_MS} step ${STEP_MS}, maxTurn ${MAXTURN}`)

function runBatch(batch: number, ms: number): Promise<void> {
  return new Promise((done) => {
    const started = new Date().toISOString()
    both(`\n##### BATCH ${batch}/${BATCHES}  searchMs=${ms}  (${GAMES} games, ${WORKERS} workers)  start ${started} #####`)
    const child = spawn('npx', ['tsx', 'scripts/search_smoke.ts', String(GAMES), String(WORKERS), String(MAXTURN), String(ms)], {
      shell: true,
      env: { ...process.env, SMOKE_MAXTURN: String(MAXTURN), SMOKE_SEARCH_MS: String(ms) },
    })
    let buf = ''
    const onData = (d: Buffer) => {
      buf += d.toString()
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); write(line) }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('close', (code) => {
      if (buf) write(buf)
      both(`##### BATCH ${batch}/${BATCHES}  searchMs=${ms}  done (exit ${code})  ${new Date().toISOString()} #####`)
      done()
    })
  })
}

;(async () => {
  for (let b = 1; b <= BATCHES; b++) {
    await runBatch(b, BASE_MS + (b - 1) * STEP_MS)
  }
  both(`\n=== MIRROR SWEEP complete ${new Date().toISOString()} ===`)
})()
