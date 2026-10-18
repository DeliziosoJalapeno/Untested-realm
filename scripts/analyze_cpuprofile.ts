// Summarises a V8 .cpuprofile (from `node --cpu-prof`) into hot-function tables.
//
//   npx tsx scripts/analyze_cpuprofile.ts profile-out/<file>.cpuprofile [--top 40]
//
// Self time = samples whose top frame is the function. Inclusive time counts a
// sample once per distinct function on its stack (recursion isn't double-counted).
// For the hottest functions it also lists the caller chains that reach them,
// which is usually where the fix belongs. Line numbers are those of tsx's
// transpiled output, so treat them as approximate.

import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'

interface CallFrame { functionName: string; url: string; lineNumber: number; columnNumber: number }
interface Node { id: number; callFrame: CallFrame; children?: number[] }
interface Profile { nodes: Node[]; samples: number[]; timeDeltas: number[]; startTime: number; endTime: number }

const argv = process.argv.slice(2)
const file = argv.find(a => !a.startsWith('--'))
if (!file) { console.error('usage: analyze_cpuprofile.ts <file.cpuprofile> [--top N]'); process.exit(1) }
const TOP = Number(argv[argv.indexOf('--top') + 1]) || 40
const prof: Profile = JSON.parse(readFileSync(file, 'utf8'))

const root = process.cwd()
const short = (url: string) => {
  if (!url) return ''
  const p = url.replace(/^file:\/\/\/?/, '').replace(/%20/g, ' ')
  const r = relative(root, p).replace(/\\/g, '/')
  return r.startsWith('..') ? p : r
}
const fnKey = (cf: CallFrame) => `${cf.functionName || '(anonymous)'} ${short(cf.url)}:${cf.lineNumber + 1}`
const fileKey = (cf: CallFrame) => short(cf.url) || `(${cf.functionName || 'native'})`

const byId = new Map<number, Node>()
const parent = new Map<number, number>()
for (const n of prof.nodes) byId.set(n.id, n)
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id)

// time per sample: V8's timeDeltas[i] is the gap BEFORE sample i, so sample i owns delta i+1
const sampleMs = prof.samples.map((_, i) => (prof.timeDeltas[i + 1] ?? 0) / 1000)
const totalMs = sampleMs.reduce((s, x) => s + x, 0)

const self = new Map<string, number>()
const incl = new Map<string, number>()
const fileSelf = new Map<string, number>()
const callers = new Map<string, Map<string, number>>()
const IDLE = new Set(['(idle)', '(program)', '(garbage collector)'])
const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)

// stacks repeat heavily; cache the per-node frame list
const stackCache = new Map<number, CallFrame[]>()
const stackOf = (id: number): CallFrame[] => {
  const hit = stackCache.get(id)
  if (hit) return hit
  const out: CallFrame[] = []
  for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
    const cf = byId.get(cur)!.callFrame
    if (cf.functionName !== '(root)') out.push(cf)
  }
  stackCache.set(id, out)
  return out
}

for (let i = 0; i < prof.samples.length; i++) {
  const ms = sampleMs[i]
  const stack = stackOf(prof.samples[i])
  if (!stack.length) continue
  const top = stack[0]
  const k = fnKey(top)
  add(self, k, ms)
  add(fileSelf, fileKey(top), ms)
  const seen = new Set<string>()
  for (const cf of stack) {
    const fk = fnKey(cf)
    if (seen.has(fk)) continue
    seen.add(fk)
    add(incl, fk, ms)
  }
  if (!IDLE.has(top.functionName)) {
    // caller chain: the next 4 distinct frames above the hot function
    const chain: string[] = []
    for (const cf of stack.slice(1)) {
      const name = cf.functionName || '(anonymous)'
      if (chain[chain.length - 1] !== name) chain.push(name)
      if (chain.length >= 4) break
    }
    if (!callers.has(k)) callers.set(k, new Map())
    add(callers.get(k)!, chain.join(' ← ') || '(top)', ms)
  }
}

const fmt = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`
const share = (ms: number) => `${((ms / totalMs) * 100).toFixed(1)}%`
const rank = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)

const out: string[] = []
out.push(`cpuprofile ${file}: ${fmt(totalMs)} sampled, ${prof.samples.length} samples`)
for (const k of IDLE) {
  const v = [...self.entries()].filter(([key]) => key.startsWith(k)).reduce((s, [, x]) => s + x, 0)
  if (v) out.push(`  ${k}: ${fmt(v)} (${share(v)})`)
}
out.push(`\nTop ${TOP} by SELF time`)
for (const [k, v] of rank(self, TOP)) out.push(`  ${fmt(v).padStart(8)} ${share(v).padStart(6)}  ${k}`)
out.push(`\nTop ${TOP} by INCLUSIVE time`)
for (const [k, v] of rank(incl, TOP)) out.push(`  ${fmt(v).padStart(8)} ${share(v).padStart(6)}  ${k}`)
out.push('\nSELF time by file')
for (const [k, v] of rank(fileSelf, 25)) out.push(`  ${fmt(v).padStart(8)} ${share(v).padStart(6)}  ${k}`)
out.push('\nWho calls the hottest functions (self time, top 5 caller chains each)')
for (const [k] of rank(self, 15)) {
  if (IDLE.has(k.split(' ')[0])) continue
  out.push(`  ${k}`)
  for (const [chain, v] of rank(callers.get(k) ?? new Map(), 5)) out.push(`      ${fmt(v).padStart(8)}  ← ${chain}`)
}
const text = out.join('\n') + '\n'
writeFileSync(file.replace(/\.cpuprofile$/, '.analysis.txt'), text)
console.log(text)
