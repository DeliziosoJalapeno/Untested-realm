// One-file-per-card bulk splitter (refactor codegen).
//
// For each batch module in gen/ (m1, m3…m56, agent3, courts):
//   • every DIRECT `registerScript('Literal', {…})` statement is moved to its own gen/<slug>.ts,
//     carrying only the imports it references (cleaned) and any helper used by ONLY that one card;
//   • the batch file keeps its name and retains loop/dynamic registrations + shared/exported helpers
//     (imports re-cleaned). A helper a per-card file needs gets `export` added. An emptied batch is deleted.
//
// Because remainders keep their filename, existing cross-file imports (e.g. m41 → ./m39) stay valid —
// no import-path rewriting. Run: `npx tsx scripts/split_cards.ts [batch…]` (no args = all batches).
import { Project, Node, SyntaxKind, type SourceFile, type Statement, type ImportDeclaration } from 'ts-morph'
import { readdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const GEN = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'shared', 'src', 'cards', 'scripts', 'gen')

const slug = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** top-level names a statement DECLARES (helpers we might relocate). */
function declaredNames(s: Statement): string[] {
  if (Node.isFunctionDeclaration(s) || Node.isClassDeclaration(s) || Node.isTypeAliasDeclaration(s) || Node.isInterfaceDeclaration(s) || Node.isEnumDeclaration(s))
    return s.getName() ? [s.getName()!] : []
  if (Node.isVariableStatement(s)) return s.getDeclarations().map((d) => d.getName())
  return []
}
const isExported = (s: Statement) => (((s as any).getModifiers?.() ?? []) as { getKind(): SyntaxKind }[]).some((m) => m.getKind() === SyntaxKind.ExportKeyword)

/** a DIRECT single-card registration: `registerScript('Name', {…})` as an expression statement. */
function directCardName(s: Statement): string | null {
  if (!Node.isExpressionStatement(s)) return null
  const e = s.getExpression()
  if (!Node.isCallExpression(e) || e.getExpression().getText() !== 'registerScript') return null
  const a0 = e.getArguments()[0]
  return a0 && Node.isStringLiteral(a0) ? a0.getLiteralValue() : null
}

/** a post-registration patch: `getScript('X')… = …` — an assignment whose LHS roots at getScript('X').
 *  These MUST live in the same module as the registration (they run after it), so they follow the card. */
function patchTarget(s: Statement): string | null {
  if (!Node.isExpressionStatement(s)) return null
  const e = s.getExpression()
  if (!Node.isBinaryExpression(e) || e.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) return null
  for (const c of e.getLeft().getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (c.getExpression().getText() === 'getScript') {
      const a0 = c.getArguments()[0]
      if (a0 && Node.isStringLiteral(a0)) return a0.getLiteralValue()
    }
  }
  return null
}

/** free identifiers referenced in a node — skips property-access member names and object keys, so
 *  `ctx.state` / `{ genesis: … }` don't pollute the set. Used to match against import & helper names. */
function refs(node: Node): Set<string> {
  const out = new Set<string>()
  for (const id of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const p = id.getParent()
    if (Node.isPropertyAccessExpression(p) && p.getNameNode() === id) continue
    if (Node.isPropertyAssignment(p) && p.getNameNode() === id) continue
    if (Node.isMethodDeclaration(p) && p.getNameNode?.() === id) continue
    if (Node.isMethodSignature(p) && p.getNameNode?.() === id) continue
    out.add(id.getText())
  }
  return out
}

// ---- import model ---------------------------------------------------------
interface Imp { module: string; typeOnlyAll: boolean; def?: string; ns?: string; named: { name: string; alias?: string; typeOnly: boolean }[] }
function parseImports(sf: SourceFile): Imp[] {
  return sf.getImportDeclarations().map((d: ImportDeclaration) => ({
    module: d.getModuleSpecifierValue(),
    typeOnlyAll: d.isTypeOnly(),
    def: d.getDefaultImport()?.getText(),
    ns: d.getNamespaceImport()?.getText(),
    named: d.getNamedImports().map((n) => ({ name: n.getName(), alias: n.getAliasNode()?.getText(), typeOnly: n.isTypeOnly() })),
  }))
}
/** emit only the bindings a target actually uses; drop whole modules that go unused (clean imports). */
function emitImports(imps: Imp[], used: Set<string>): string {
  const lines: string[] = []
  for (const im of imps) {
    const parts: string[] = []
    if (im.def && used.has(im.def)) parts.push(im.def)
    if (im.ns && used.has(im.ns)) parts.push(`* as ${im.ns}`)
    const named = im.named.filter((n) => used.has(n.alias ?? n.name))
    if (named.length) parts.push(`{ ${named.map((n) => `${n.typeOnly && !im.typeOnlyAll ? 'type ' : ''}${n.name}${n.alias ? ` as ${n.alias}` : ''}`).join(', ')} }`)
    if (!parts.length) continue
    lines.push(`import ${im.typeOnlyAll ? 'type ' : ''}${parts.join(', ')} from '${im.module}'`)
  }
  return lines.join('\n')
}

// ---- split one batch ------------------------------------------------------
const usedSlugs = new Set(readdirSync(GEN).filter((f) => f.endsWith('.ts')).map((f) => f.replace(/\.ts$/, '')))
let created = 0, deleted = 0, keptBatches = 0

function splitBatch(project: Project, base: string): void {
  const path = join(GEN, `${base}.ts`)
  const sf = project.addSourceFileAtPath(path)
  const src = sf.getFullText()
  const stmts = sf.getStatements()
  const helperNames = new Set(stmts.flatMap(declaredNames))

  // per-statement: block text WITH its own leading comment (from the end of the previous statement),
  // and the set of helper/import names it references.
  let prevEnd = 0
  const blocks = stmts.map((s) => {
    const t = src.slice(prevEnd, s.getEnd()); prevEnd = s.getEnd()
    return t.replace(/^\s*\n/, '')
  })
  const allImports = parseImports(sf)
  const importNames = new Set<string>()
  for (const im of allImports) { if (im.def) importNames.add(im.def); if (im.ns) importNames.add(im.ns); for (const n of im.named) importNames.add(n.alias ?? n.name) }
  const usedHelpersOf = stmts.map((s) => new Set([...refs(s)].filter((n) => helperNames.has(n))))

  // classify statements
  type Kind = 'import' | 'card' | 'helper' | 'other'
  const kind: Kind[] = stmts.map((s) =>
    Node.isImportDeclaration(s) ? 'import' : directCardName(s) !== null ? 'card' : declaredNames(s).length ? 'helper' : 'other')

  // which helpers must STAY in the remainder: exported, referenced by a non-card statement, or by ≥2 cards.
  const cardIdx = stmts.map((_, i) => i).filter((i) => kind[i] === 'card')
  const cardUsers = new Map<string, Set<number>>() // helper → set of card statement indices
  for (const i of cardIdx) for (const h of usedHelpersOf[i]) (cardUsers.get(h) ?? cardUsers.set(h, new Set()).get(h)!).add(i)
  const stay = new Set<string>()
  stmts.forEach((s, i) => { if (kind[i] === 'helper' && isExported(s)) declaredNames(s).forEach((n) => stay.add(n)) })
  stmts.forEach((s, i) => { if (kind[i] === 'other' || kind[i] === 'helper') for (const h of usedHelpersOf[i]) if (!(kind[i] === 'helper' && declaredNames(s).includes(h))) stay.add(h) })
  for (const [h, users] of cardUsers) if (users.size >= 2) stay.add(h)
  // fixpoint: a staying helper's own dependencies also stay
  for (let changed = true; changed; ) {
    changed = false
    stmts.forEach((s, i) => { if (kind[i] === 'helper' && declaredNames(s).some((n) => stay.has(n))) for (const h of usedHelpersOf[i]) if (!stay.has(h)) { stay.add(h); changed = true } })
  }
  // owned helper (statement index) → the single card index that owns it
  const ownerOf = new Map<number, number>()
  stmts.forEach((s, i) => {
    if (kind[i] !== 'helper') return
    const names = declaredNames(s)
    if (names.some((n) => stay.has(n))) return
    const users = new Set<number>(); for (const n of names) for (const u of cardUsers.get(n) ?? []) users.add(u)
    if (users.size === 1) ownerOf.set(i, [...users][0])
  })

  // helpers a per-card file will import from the (retained) batch module
  const stayNeededByCards = new Set<string>()

  // post-registration patches (`getScript('X')… = …`) that target a card split from THIS batch move
  // into that card's file (right after the registration). Patches on cards registered elsewhere (loop
  // families, parent-module tokens) stay in the remainder, where load order already satisfies them.
  const directNames = new Set(cardIdx.map((i) => directCardName(stmts[i])!))
  const patchCardOf = new Map<number, string>()
  stmts.forEach((s, i) => { if (kind[i] === 'other') { const t = patchTarget(s); if (t && directNames.has(t)) patchCardOf.set(i, t) } })
  const patchesFor = (name: string) => [...patchCardOf.entries()].filter(([, n]) => n === name).map(([i]) => i)

  // emit per-card files
  for (const ci of cardIdx) {
    const name = directCardName(stmts[ci])!
    let s = slug(name); if (usedSlugs.has(s)) { let k = 2; while (usedSlugs.has(`${s}-${k}`)) k++; s = `${s}-${k}` }
    usedSlugs.add(s)
    const ownedIdx = [...ownerOf.entries()].filter(([, c]) => c === ci).map(([hi]) => hi).sort((a, b) => a - b)
    const bodyStmts = [...ownedIdx, ci, ...patchesFor(name)].sort((a, b) => a - b)
    const used = new Set<string>()
    for (const bi of bodyStmts) for (const n of refs(stmts[bi])) used.add(n)
    const stayUsed = [...used].filter((n) => stay.has(n))
    stayUsed.forEach((n) => stayNeededByCards.add(n))
    const head = emitImports(allImports, used)
    const stayImport = stayUsed.length ? `import { ${stayUsed.sort().join(', ')} } from './${base}'` : ''
    const body = bodyStmts.map((bi) => {
      const t = blocks[bi].trimEnd()
      // a statement whose code starts with ( / [ / ` after the previous line's `}` would be mis-parsed
      // as a call/index/tag (ASI hazard) — guard it with a leading `;` (a patch like `;(getScript…)`).
      const code = t.replace(/^(\s*\/\/[^\n]*\n)+/, '').trimStart()
      return /^[([`]/.test(code) ? `;${t}` : t
    }).join('\n\n')
    const content = [head, stayImport].filter(Boolean).join('\n') + '\n\n' + body + '\n'
    writeFileSync(join(GEN, `${s}.ts`), content); created++
  }

  // remainder: retained statements (others + staying helpers), imports re-cleaned, exports added where needed
  const keepIdx = stmts.map((_, i) => i).filter((i) => (kind[i] === 'other' && !patchCardOf.has(i)) || (kind[i] === 'helper' && declaredNames(stmts[i]).some((n) => stay.has(n))))
  if (keepIdx.length === 0) { sf.forget(); rmSync(path); deleted++; return }
  const remUsed = new Set<string>()
  for (const i of keepIdx) for (const n of refs(stmts[i])) remUsed.add(n)
  const remHead = emitImports(allImports, remUsed)
  const remBody = keepIdx.map((i) => {
    let t = blocks[i].trimEnd()
    // add `export` to a staying helper a per-card file imports, if not already exported
    if (kind[i] === 'helper' && !isExported(stmts[i]) && declaredNames(stmts[i]).some((n) => stayNeededByCards.has(n)))
      t = t.replace(/^(\s*)(?=(function|const|let|var|class|type|interface|enum)\b)/m, '$1export ')
    return t
  }).join('\n\n')
  const header = `// Retained ${base} module: card families registered via loops + helpers shared across the split cards.\n`
  writeFileSync(path, header + [remHead].filter(Boolean).join('\n') + '\n\n' + remBody + '\n')
  keptBatches++
}

// ---- run ------------------------------------------------------------------
const argBatches = process.argv.slice(2)
const batches = (argBatches.length ? argBatches : readdirSync(GEN)
  .filter((f) => /^(m\d+|agent3|courts)\.ts$/.test(f))
  .map((f) => f.replace(/\.ts$/, '')))
const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true, compilerOptions: { allowJs: false } })
for (const b of batches) splitBatch(project, b)
console.log(`split ${batches.length} batch(es): ${created} per-card files created, ${keptBatches} batches retained, ${deleted} emptied+deleted`)
