// User-facing changelog shown by the "What's new" button on the home page.
//
// To add or edit a release, just drop / edit a markdown file in ./changelog/,
// ONE FILE PER VERSION, named exactly after the version: `changelog/0.3.14.md`.
// No code change or rebuild-of-this-file needed — they are picked up automatically
// and sorted newest-first.
//
// File format (all optional except the bullets):
//
//     2026-08-06                     <- a date line (YYYY-MM-DD) — may also be part
//                                        of a heading like "# 0.3.14 — 2026-08-06"
//
//     ### UI fixes                   <- an optional subsection heading. Markdown
//                                        `#`…`######`, with or without trailing
//                                        `#`s (so `#### UI ####` works too). Every
//                                        heading starts a new subsection.
//     - First change, one bullet per line.
//     - Second change. A bullet may wrap onto the
//       following line(s); they are joined together.
//
//     ### Card fixes
//     - A change under the second subsection.
//
// Anything before the first bullet/heading that isn't a date is ignored, so you
// can title the file however you like.

export interface ChangelogSection {
  title?: string // subsection heading; undefined = ungrouped bullets
  changes: string[]
}

export interface ChangelogEntry {
  version: string
  date?: string // ISO date, optional
  sections: ChangelogSection[]
  changes: string[] // every bullet, flattened (for the summary count / simple listing)
}

// Bulk-import every version file as raw markdown text (Vite / Vitest feature).
const files = import.meta.glob('./changelog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** version string from the file path: "./changelog/0.3.14.md" -> "0.3.14" */
function versionOf(path: string): string {
  return path.replace(/^.*[\\/]/, '').replace(/\.md$/i, '')
}

/** a markdown heading line ("### Title", "#### Title ####") -> its text, else null */
function headingText(t: string): string | null {
  const m = t.match(/^#{1,6}\s*(.*?)\s*#*$/)
  return m ? m[1].trim() : null
}

function parseEntry(path: string, raw: string): ChangelogEntry {
  const version = versionOf(path)
  let date: string | undefined
  const sections: ChangelogSection[] = []
  const last = (): ChangelogSection | undefined => sections[sections.length - 1]

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue

    const bullet = t.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      if (!last()) sections.push({ changes: [] }) // bullets before any heading → untitled section
      last()!.changes.push(bullet[1].trim())
      continue
    }

    const heading = headingText(t)
    if (heading !== null) {
      // a heading may also carry the date ("# 0.3.14 — 2026-08-06")
      if (!date) {
        const dm = heading.match(/\b\d{4}-\d{2}-\d{2}\b/)
        if (dm) date = dm[0]
      }
      sections.push({ title: heading, changes: [] })
      continue
    }

    // a plain non-bullet line: a bare date, else a wrapped continuation of the last bullet
    if (!date) {
      const dm = t.match(/\b\d{4}-\d{2}-\d{2}\b/)
      if (dm) {
        date = dm[0]
        continue
      }
    }
    const cur = last()
    if (cur && cur.changes.length) {
      cur.changes[cur.changes.length - 1] += ' ' + t
    }
  }

  // drop empty sections (e.g. a heading with no bullets, or the implicit lead-in)
  const kept = sections.filter((s) => s.changes.length > 0)
  const changes = kept.flatMap((s) => s.changes)
  return date ? { version, date, sections: kept, changes } : { version, sections: kept, changes }
}

/** numeric, dot-segment version compare — descending (newest first) */
function byVersionDesc(a: ChangelogEntry, b: ChangelogEntry): number {
  const pa = a.version.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.version.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (d) return d
  }
  return 0
}

export const CHANGELOG: ChangelogEntry[] = Object.entries(files)
  .map(([path, raw]) => parseEntry(path, raw))
  .sort(byVersionDesc)
