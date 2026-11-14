// Which lessons this browser has completed (a per-device convenience, not account data).
const KEY = 'sorcery-tutorial-done'

export function lessonsDone(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]) } catch { return new Set() }
}
export function markLessonDone(id: string): void {
  try { const s = lessonsDone(); s.add(id); localStorage.setItem(KEY, JSON.stringify([...s])) } catch { /* private window: progress just isn't kept */ }
}
