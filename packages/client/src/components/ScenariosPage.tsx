import { useEffect, useState } from 'react'
import type { GameState } from '@sorcery/shared'
import * as auth from '../auth'
import type { ScenarioMeta } from '../auth'

/** Browse and load saved board scenarios (DB-backed). Public scenarios — including
 *  the built-in DOM/audit fixtures — are visible to everyone; signing in also shows
 *  your own private scenarios and lets you delete the ones you own. Saving a NEW
 *  scenario happens from the in-game Editor's "Save as scenario" button. */
export default function ScenariosPage({
  username,
  onBack,
  onLoad,
}: {
  username: string | null
  onBack: () => void
  onLoad: (state: GameState) => void
}) {
  const [list, setList] = useState<ScenarioMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // id currently loading/deleting

  async function refresh() {
    try {
      setList(await auth.fetchScenarios())
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load scenarios.')
      setList([])
    }
  }
  useEffect(() => { void refresh() }, [])

  async function load(id: string) {
    setBusy(id); setError(null)
    try {
      const full = await auth.fetchScenario(id)
      onLoad(full.data)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load that scenario.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this scenario? This cannot be undone.')) return
    setBusy(id); setError(null)
    try {
      await auth.deleteScenario(id)
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete that scenario.')
    } finally {
      setBusy(null)
    }
  }

  const builtins = (list ?? []).filter((s) => s.builtin)
  const mine = (list ?? []).filter((s) => s.mine && !s.builtin)
  const community = (list ?? []).filter((s) => !s.builtin && !s.mine)

  const row = (s: ScenarioMeta) => (
    <div key={s.id} className="scenario-row">
      <span className="scenario-name">{s.name}</span>
      <span className="scenario-badges">
        {s.builtin && <span className="badge builtin" title="Ships with the game">built-in</span>}
        {!s.isPublic && <span className="badge private" title="Only you can see this">private</span>}
        {s.isPublic && !s.builtin && <span className="badge public" title="Everyone can load this">public</span>}
      </span>
      <button disabled={busy === s.id} onClick={() => load(s.id)}>{busy === s.id ? '…' : '▶ Load'}</button>
      {s.mine && !s.builtin && (
        <button disabled={busy === s.id} className="danger" onClick={() => remove(s.id)}>🗑</button>
      )}
    </div>
  )

  return (
    <div className="deckbuilder">
      <div className="db-toolbar">
        <button onClick={onBack}>← Back</button>
        <b>🎬 Scenarios</b>
        <span className="jp-hint">Load a saved board into a local pass-and-play game. Build & save your own from the in-game Editor.</span>
      </div>

      {error && <div className="toast error" style={{ position: 'static', margin: '8px 0' }}>{error}</div>}
      {list === null && <p style={{ opacity: 0.7 }}>Loading…</p>}

      {list !== null && (
        <div className="scenario-list">
          <h3>Built-in sandboxes</h3>
          {builtins.length === 0 ? <p style={{ opacity: 0.6 }}>None.</p> : builtins.map(row)}

          <h3>Your scenarios</h3>
          {!username ? (
            <p style={{ opacity: 0.7 }}>Sign in on the home screen to save and manage your own scenarios.</p>
          ) : mine.length === 0 ? (
            <p style={{ opacity: 0.6 }}>None yet — open the Editor in a game and use “Save as scenario”.</p>
          ) : (
            mine.map(row)
          )}

          <h3>Community (public)</h3>
          {community.length === 0 ? <p style={{ opacity: 0.6 }}>None yet.</p> : community.map(row)}
        </div>
      )}
    </div>
  )
}
