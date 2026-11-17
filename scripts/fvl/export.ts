import { deckToText } from '../../packages/shared/src'
import { DECKS } from './decks'
for (const k of process.argv.slice(2)) console.log(`===== ${k} =====\n${deckToText(DECKS[k])}\n`)
