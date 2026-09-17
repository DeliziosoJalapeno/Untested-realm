// Secret-achievement UI: the mid-game unlock toasts and the browsable list modal.
import { useEffect } from 'react'
import { ACHIEVEMENTS, achievementDef } from '@sorcery/shared'
import { loadUnlocked, unlockedCount } from '../achievements'

// ── unlock toasts ───────────────────────────────────────────────────────────────
function Toast({ id, onDone }: { id: string; onDone: () => void }) {
  const def = achievementDef(id)
  useEffect(() => {
    const t = setTimeout(onDone, 7000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!def) return null
  return (
    <div className="achv-toast" onClick={onDone} role="status">
      <span className="achv-toast-trophy">🏆</span>
      <span className="achv-toast-body">
        <span className="achv-toast-kicker">Achievement unlocked</span>
        <span className="achv-toast-name">{def.name}</span>
        <span className="achv-toast-hint">{def.hint}</span>
      </span>
    </div>
  )
}

export function AchievementToasts({
  toasts,
  onDismiss,
}: {
  toasts: { key: number; id: string }[]
  onDismiss: (key: number) => void
}) {
  if (!toasts.length) return null
  return (
    <div className="achv-toasts">
      {toasts.map((t) => (
        <Toast key={t.key} id={t.id} onDone={() => onDismiss(t.key)} />
      ))}
    </div>
  )
}

// ── the full list (secret while locked) ───────────────────────────────────────────
export function AchievementsModal({ onClose }: { onClose: () => void }) {
  const unlocked = loadUnlocked()
  const total = ACHIEVEMENTS.length
  const got = unlockedCount(unlocked)
  // earned first (most recent on top), then the locked ones as anonymous mysteries
  const earned = ACHIEVEMENTS.filter((a) => unlocked[a.id]).sort((a, b) => (unlocked[b.id] ?? 0) - (unlocked[a.id] ?? 0))
  const lockedCount = total - earned.length

  return (
    <div className="achv-overlay" onClick={onClose}>
      <div className="achv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="achv-head">
          <h3>🏆 Secret Achievements</h3>
          <span className="achv-count">{got} / {total}</span>
          <button className="achv-x" title="Close" onClick={onClose}>✕</button>
        </div>
        <div className="achv-list">
          {earned.map((a) => (
            <div key={a.id} className="achv-row unlocked">
              <span className="achv-row-icon">🏆</span>
              <span className="achv-row-text">
                <span className="achv-row-name">{a.name}</span>
                <span className="achv-row-hint">{a.hint}</span>
              </span>
            </div>
          ))}
          {lockedCount > 0 && (
            <div className="achv-locked-note">
              🔒 {lockedCount} more secret{lockedCount === 1 ? '' : 's'} to discover…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
