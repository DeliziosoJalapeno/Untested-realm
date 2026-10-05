import { useEffect, useState } from 'react'
import * as auth from '../auth'
import type { ReplayMeta } from '../auth'
import type { ReplayRecord } from '../replay'

/** Browse and watch saved game replays (DB-backed). Public replays are visible to everyone; signing in
 *  also shows your own private replays and lets you delete the ones you own. Replays are saved from the
 *  game-over screen of a local (pass-and-play / vs-computer) game. */
export default function ReplaysPage({
  username,
  onBack,
  onWatch,
}: {
  username: string | null
  onBack: () => void
  onWatch: (replay: ReplayRecord) => void
}) {
  const [list, setList] = useState<ReplayMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function refresh() {
    try {
      setList(await auth.fetchReplays())
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load replays.')
      setList([])
    }
  }
  useEffect(() => { void refresh() }, [])

  async function watch(id: string) {
    setBusy(id); setError(null)
    try {
      const full = await auth.fetchReplay(id)
      onWatch(full.data)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load that replay.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this replay? This cannot be undone.')) return
    setBusy(id); setError(null)
    try {
      await auth.deleteReplay(id)
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete that replay.')
    } finally {
      setBusy(null)
    }
  }

  const mine = (list ?? []).filter((s) => s.mine)
  // Community lists ALL public replays — including your own, so you can confirm they're shared
  const community = (list ?? []).filter((s) => s.isPublic)

  const row = (s: ReplayMeta) => (
    <div key={s.id} className="scenario-row">
      <span className="scenario-name">{s.name}</span>
      <span className="scenario-badges">
        {!s.isPublic && <span className="badge private" title="Only you can see this">private</span>}
        {s.isPublic && <span className="badge public" title="Everyone can watch this">public</span>}
      </span>
      <button disabled={busy === s.id} onClick={() => watch(s.id)}>{busy === s.id ? '…' : '▶ Watch'}</button>
      {s.mine && (
        <button disabled={busy === s.id} className="danger" onClick={() => remove(s.id)}>🗑</button>
      )}
    </div>
  )

  return (
    <div className="deckbuilder">
      <div className="db-toolbar">
        <button onClick={onBack}>← Back</button>
        <b>▶ Replays</b>
        <span className="jp-hint">Watch a recorded game back, move by move. Save your own from a local game's game-over screen.</span>
      </div>

      {error && <div className="toast error" style={{ position: 'static', margin: '8px 0' }}>{error}</div>}
      {list === null && <p style={{ opacity: 0.7 }}>Loading…</p>}

      {list !== null && (
        <div className="scenario-list">
          <h3>Your replays</h3>
          {!username ? (
            <p style={{ opacity: 0.7 }}>Sign in on the home screen to save and manage your own replays.</p>
          ) : mine.length === 0 ? (
            <p style={{ opacity: 0.6 }}>None yet — finish a game and use “Save replay”.</p>
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
