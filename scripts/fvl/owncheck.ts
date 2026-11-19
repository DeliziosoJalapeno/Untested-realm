// Which cards of a deck go beyond what the user owns:  npx tsx scripts/fvl/owncheck.ts <deck key>...
import { findCard } from '../../packages/shared/src'
import { PRECONS } from '../../packages/shared/src/cards/precons'
import { owned } from './owned'
import { DECKS } from './decks'
console.log('precons counted:', PRECONS.filter((p) => p.set === 'Gothic' || p.set === 'Frost Mage vs Lavamancer').map((p) => p.name).join(' | '))
for (const key of process.argv.slice(2)) {
  const d = DECKS[key]; console.log('\n' + key); let short = 0
  for (const m of [d.spellbook, d.atlas, d.collection ?? {}]) for (const [n, c] of Object.entries(m)) { const o = owned(n); if (o.n < c) { short += c - o.n; console.log(`  SHORT ${n}: need ${c}, own ${o.n}${o.why ? ' (' + o.why + ')' : ''}  [${findCard(n)?.rarity}, ${(findCard(n)?.sets as string[]).join('/')}]`) } }
  console.log(`  cards short: ${short}`)
}
