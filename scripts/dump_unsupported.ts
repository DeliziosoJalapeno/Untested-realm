import { writeFileSync } from 'node:fs'
import { allCards, cardSupport } from '../packages/shared/src/cards/db'
import '../packages/shared/src/cards/scripts/index'

const ab = allCards.filter((c) => (c.sets.includes('Alpha') || c.sets.includes('Beta')) && cardSupport(c) === 'unsupported')
const rest = allCards.filter((c) => !(c.sets.includes('Alpha') || c.sets.includes('Beta')) && cardSupport(c) === 'unsupported')

function fmt(cards: typeof allCards): string {
  return cards
    .map((c) => {
      const th = Object.entries(c.thresholds).filter(([, v]) => v > 0).map(([k, v]) => k[0].toUpperCase().repeat(v)).join('')
      const stats = c.type === 'Minion' ? ` ${c.attack}/${c.defence}` : c.type === 'Avatar' ? ` life${c.life} atk${c.attack}` : ''
      return `### ${c.name} [${c.type}${stats} | cost ${c.cost} ${th} | ${c.rarity}]\n${c.text}\n`
    })
    .join('\n')
}

writeFileSync('unsupported_ab.md', `# Alpha/Beta unsupported (${ab.length})\n\n${fmt(ab)}`, 'utf8')
writeFileSync('unsupported_rest.md', `# Other sets unsupported (${rest.length})\n\n${fmt(rest)}`, 'utf8')
console.log(`alpha/beta: ${ab.length}, other sets: ${rest.length}`)
