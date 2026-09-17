// Census: how many cards does the engine support, and what text patterns
// dominate the unsupported pile? Run: npx tsx scripts/census.ts [--list]
import { allCards, cardSupport } from '../packages/shared/src/cards/db'
import '../packages/shared/src/cards/scripts/index'

const counts: Record<string, Record<string, number>> = {}
const unsupported: { name: string; type: string; sets: string[]; text: string }[] = []

for (const c of allCards) {
  const s = cardSupport(c)
  counts[c.type] ??= { auto: 0, scripted: 0, unsupported: 0 }
  counts[c.type][s]++
  if (s === 'unsupported') unsupported.push({ name: c.name, type: c.type, sets: c.sets, text: c.text })
}

console.log('=== support by type ===')
let tot = { auto: 0, scripted: 0, unsupported: 0 }
for (const [t, c] of Object.entries(counts)) {
  console.log(`${t.padEnd(10)} auto=${c.auto} scripted=${c.scripted} unsupported=${c.unsupported}`)
  tot.auto += c.auto
  tot.scripted += c.scripted
  tot.unsupported += c.unsupported
}
console.log(`TOTAL      auto=${tot.auto} scripted=${tot.scripted} unsupported=${tot.unsupported} / ${allCards.length}`)

// by set for unsupported
const bySet: Record<string, number> = {}
for (const u of unsupported) for (const s of u.sets) bySet[s] = (bySet[s] ?? 0) + 1
console.log('\n=== unsupported by set (multi-counted) ===')
console.log(bySet)

// common simple patterns worth scripting in bulk
const patterns: [string, RegExp][] = [
  ['genesis draw N', /^genesis → draw (a|two|three|\d+) (spell|site|card)s?\.?$/i],
  ['genesis deal dmg', /^genesis → deal \d+ damage/i],
  ['deal N dmg target', /^deal \d+ damage to target/i],
  ['gain N life', /^(you )?gain \d+ life\.?$/i],
  ['deathrite simple', /^deathrite → (draw|deal|gain|summon)/i],
  ['kw + genesis draw', /^[a-z +,0-9]*\n+genesis → draw (a|two|three|\d+) (spell|site|card)s?\.?$/i],
]
console.log('\n=== bulk-scriptable patterns among unsupported ===')
for (const [label, re] of patterns) {
  const hits = unsupported.filter((u) => re.test(u.text.trim()))
  console.log(`${label}: ${hits.length}`)
}

if (process.argv.includes('--list')) {
  console.log('\n=== all unsupported (name | type | text) ===')
  for (const u of unsupported) console.log(`${u.name} | ${u.type} | ${JSON.stringify(u.text.slice(0, 120))}`)
}
