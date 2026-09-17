// Parse the flat faq_dump.md (repeated `### Card Name` blocks, each with a Q:/A: pair) into a
// direct card→FAQ map and emit it as JSON the client bundles. Run: `npm run gen:faq`.
// Regenerate whenever faq_dump.md changes. Keeping it pre-parsed means the FAQ view does an O(1)
// lookup by card name instead of scanning 3000+ lines at runtime.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { allCards } from '../packages/shared/src/index'

const ROOT = resolve(import.meta.dirname, '..')
const src = readFileSync(resolve(ROOT, 'faq_dump.md'), 'utf8')

type QA = { q: string; a: string }
const map: Record<string, QA[]> = {}

let name = ''
let cur: QA | null = null
const flush = () => { if (name && cur && (cur.q || cur.a)) (map[name] ??= []).push(cur); cur = null }

for (const raw of src.split(/\r?\n/)) {
  const line = raw.trimEnd()
  if (line.startsWith('### ')) { flush(); name = line.slice(4).trim(); continue }
  if (/^Q:/i.test(line)) { flush(); cur = { q: line.replace(/^Q:\s*/i, ''), a: '' }; continue }
  if (/^A:/i.test(line)) { if (cur) cur.a = line.replace(/^A:\s*/i, ''); continue }
  if (line === '') { flush(); continue }
  // continuation of a multi-line answer
  if (cur) cur.a += (cur.a ? '\n' : '') + line
}
flush()

// Coverage report: how many FAQ card names actually match a real card (apostrophe-normalised).
const norm = (s: string) => s.replace(/[’']/g, "'").toLowerCase().trim()
const cardByNorm = new Map(allCards.map((c) => [norm(c.name), c.name]))
let matched = 0, unmatched: string[] = []
const out: Record<string, QA[]> = {}
for (const [faqName, qas] of Object.entries(map)) {
  const real = cardByNorm.get(norm(faqName))
  if (real) { out[real] = [...(out[real] ?? []), ...qas]; matched++ }
  else unmatched.push(faqName)
}

const dest = resolve(ROOT, 'packages/client/src/faqData.json')
writeFileSync(dest, JSON.stringify(out, null, 0))
console.log(`FAQ: ${Object.keys(out).length} cards, ${Object.values(out).reduce((n, a) => n + a.length, 0)} Q/A pairs → ${dest}`)
console.log(`matched card names: ${matched}, unmatched: ${unmatched.length}`)
if (unmatched.length) console.log('  unmatched:', unmatched.slice(0, 40).join(' | '))
