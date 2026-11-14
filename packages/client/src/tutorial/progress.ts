// Which lessons this browser has completed (a per-device convenience, not account data).
const KEY = 'sorcery-tutorial-done'

export function lessonsDone(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]) } catch { return new Set() }
}
export function markLessonDone(id: string): void {
  try { const s = lessonsDone(); s.add(id); localStorage.setItem(KEY, JSON.stringify([...s])) } catch { /* private window: progress just isn't kept */ }
}

const PUZZLE_KEY = 'sorcery-puzzles-solved'
export function puzzlesSolved(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(PUZZLE_KEY) ?? '[]') as string[]) } catch { return new Set() }
}
export function markPuzzleSolved(id: string): void {
  try { const s = puzzlesSolved(); s.add(id); localStorage.setItem(PUZZLE_KEY, JSON.stringify([...s])) } catch { /* not kept in a private window */ }
}
