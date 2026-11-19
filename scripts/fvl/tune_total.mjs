// Totals a tuning generation: reads every part-*.json in the folder, prints the candidates' results and
// the next base (only the weights that differ from the code's defaults).
//   node scripts/fvl/tune_total.mjs <candidates> <seed> <sigma> '<base weights json>' '<default weights json>'
import { readdirSync, readFileSync } from 'node:fs'
import { nextBase } from './tune_math.mjs'
const [nArg, sArg, sigArg, baseArg, defArg] = process.argv.slice(2)
const defaults = JSON.parse(defArg)
const base = { ...defaults, ...JSON.parse(baseArg || '{}') }
const byCand = new Map()
for (const f of readdirSync('.').filter((x) => /^part-.*\.json$/.test(x))) {
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim().startsWith('{')) continue
    const r = JSON.parse(line)
    const t = byCand.get(r.candidate) ?? { candidate: r.candidate, a: 0, b: 0, draws: 0 }
    t.a += r.a; t.b += r.b; t.draws += r.draws; byCand.set(r.candidate, t)
  }
}
const results = [...byCand.values()].sort((x, y) => x.candidate - y.candidate)
const games = results.reduce((s, r) => s + r.a + r.b + r.draws, 0)
const { weights, used, moved } = nextBase(base, Object.keys(defaults), results, Number(sArg), Number(nArg), Number(sigArg))
const diff = {}
for (const k of Object.keys(defaults)) if (weights[k] !== defaults[k]) diff[k] = weights[k]
console.log('CANDIDATES ' + JSON.stringify(results))
console.log('MOVED ' + JSON.stringify(moved))
console.log('NEXT ' + JSON.stringify({ games, pairsUsed: used, weights: diff }))
