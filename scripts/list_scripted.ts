// List every card handled by a unique engine script (cardSupport === 'scripted').
// Writes SCRIPTED_CARDS.md at the repo root and prints a summary.
// Run: npx tsx scripts/list_scripted.ts
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { allCards, cardSupport } from '../packages/shared/src/cards/db'
import '../packages/shared/src/cards/scripts/index'

const scripted = allCards.filter((c) => cardSupport(c) === 'scripted')

// group by card type, alphabetical within each group
const TYPE_ORDER = ['Avatar', 'Minion', 'Magic', 'Aura', 'Artifact', 'Site']
const byType: Record<string, string[]> = {}
for (const c of scripted) (byType[c.type] ??= []).push(c.name)
for (const t of Object.keys(byType)) byType[t].sort((a, b) => a.localeCompare(b))
const types = [...new Set([...TYPE_ORDER, ...Object.keys(byType)])].filter((t) => byType[t])

let md = `# Scripted cards\n\n`
md += `Cards handled by a unique engine script (not keyword-only "auto" cards). `
md += `**${scripted.length}** of ${allCards.length} total cards.\n\n`
md += `| Type | Count |\n| --- | --- |\n`
for (const t of types) md += `| ${t} | ${byType[t].length} |\n`
md += `\n`
for (const t of types) {
  md += `## ${t} (${byType[t].length})\n\n`
  for (const name of byType[t]) md += `- ${name}\n`
  md += `\n`
}

const out = resolve(import.meta.dirname, '../SCRIPTED_CARDS.md')
writeFileSync(out, md)

console.log(`scripted cards: ${scripted.length} / ${allCards.length}`)
for (const t of types) console.log(`  ${t.padEnd(9)} ${byType[t].length}`)
console.log(`\nwrote ${out}`)
