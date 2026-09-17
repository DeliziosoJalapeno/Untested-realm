// Direct card→FAQ lookup for the in-game FAQ view. The map is pre-parsed from faq_dump.md by
// `npm run gen:faq` (scripts/gen_faq.ts) into faqData.json, so this is an O(1) name lookup — no
// runtime scanning of the 3000-line dump. Regenerate faqData.json whenever faq_dump.md changes.
import faqData from './faqData.json'

export type FaqEntry = { q: string; a: string }

const FAQ = faqData as Record<string, FaqEntry[]>
// apostrophe-insensitive alias map (card data uses straight ' , the dump sometimes curly ’)
const byNorm = new Map<string, FaqEntry[]>()
const norm = (s: string) => s.replace(/[’']/g, "'").toLowerCase().trim()
for (const [name, qas] of Object.entries(FAQ)) byNorm.set(norm(name), qas)

/** the FAQ Q/A entries for a card, or null if it has none. */
export function faqFor(name: string | null | undefined): FaqEntry[] | null {
  if (!name) return null
  return FAQ[name] ?? byNorm.get(norm(name)) ?? null
}

/** does this card have any FAQ entries? (drives the golden border in the FAQ view) */
export function hasFaq(name: string | null | undefined): boolean {
  return faqFor(name) !== null
}
