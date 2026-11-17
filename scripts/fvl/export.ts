// Write one import-ready text file per deck:  npx tsx scripts/fvl/export.ts <out dir> <deck key>...
import { writeFileSync } from 'node:fs'
import { deckToText, parseDeckText, validateDeck } from '../../packages/shared/src'
import { DECKS } from './decks'
const [dir, ...keys] = process.argv.slice(2)
for (const k of keys) {
  const text = deckToText(DECKS[k])
  const back = parseDeckText(k, text) // what the import box will make of it
  const ok = JSON.stringify(back.spellbook) === JSON.stringify(DECKS[k].spellbook) && JSON.stringify(back.atlas) === JSON.stringify(DECKS[k].atlas) && back.avatar === DECKS[k].avatar && !validateDeck(back).some((p) => p.level === 'error')
  const file = `${dir}/${k.replace(/^[A-Z]\d+\s+/, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.txt`
  writeFileSync(file, text + '\n')
  console.log(ok ? 'ok ' : 'MISMATCH ', file)
}
