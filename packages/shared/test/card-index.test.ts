// Guards for the card-script registration wiring (the backbone of the one-file-per-card refactor):
//  1. gen/index.ts imports EXACTLY the set of self-registering modules in that folder — so a new file
//     can never be silently left out (the "80 cards quietly unsupported" failure class). Fix drift with
//     `npm run gen:card-index`.
//  2. No card name is registered by two modules anywhere — which is what makes load ORDER irrelevant
//     (nothing relies on "the later registration wins").
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cards', 'scripts')
const GEN = join(SCRIPTS, 'gen')

const readIn = (dir: string, f: string) => readFileSync(join(dir, f), 'utf8')
/** `.ts` modules in `dir` that self-register at least one card (excludes index.ts + pure helpers). */
const scriptFilesIn = (dir: string) =>
  readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts' && readIn(dir, f).includes('registerScript('))

describe('gen/index.ts stays complete (no hand-maintenance drift)', () => {
  it('imports exactly the card-script modules present in the folder', () => {
    const imported = new Set([...readIn(GEN, 'index.ts').matchAll(/import ['"]\.\/([^'"]+)['"]/g)].map((m) => m[1]))
    const expected = new Set(scriptFilesIn(GEN).map((f) => f.replace(/\.ts$/, '')))
    const missing = [...expected].filter((m) => !imported.has(m)).sort()
    const extra = [...imported].filter((m) => !expected.has(m)).sort()
    expect(missing, 'modules that self-register but are NOT imported — run `npm run gen:card-index`').toEqual([])
    expect(extra, 'index imports a module that no longer registers any card').toEqual([])
  })
})

describe('no card is registered by two modules (load order stays irrelevant)', () => {
  it('every registerScript name is unique across all script files', () => {
    const seen = new Map<string, string>()
    const dupes: string[] = []
    const scan = (dir: string, label: string) => {
      for (const f of scriptFilesIn(dir)) {
        // capture up to the SAME closing quote, so a double-quoted name with an apostrophe
        // ("Merlin's Staff") isn't truncated at the apostrophe.
        for (const m of readIn(dir, f).matchAll(/registerScript\(\s*('|")(.*?)\1/g)) {
          const name = m[2]
          if (seen.has(name)) dupes.push(`${name} — in ${seen.get(name)} AND ${label}/${f}`)
          else seen.set(name, `${label}/${f}`)
        }
      }
    }
    scan(SCRIPTS, 'scripts') // top-level named modules (magics, minions, sites, …)
    scan(GEN, 'gen')
    expect(dupes, 'duplicate registrations make load order matter — merge or rename').toEqual([])
  })
})
