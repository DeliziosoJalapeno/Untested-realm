import { useEffect, useState } from 'react'
import type { GameState } from '@sorcery/shared'
import * as auth from '../auth'
import type { AdminBug } from '../auth'
import type { ReplayRecord } from '../replay'

/** Admin-only panel: browse reported bugs, open each one's replay or scenario, and reply to the reporter
 *  (solved / not-a-bug close it; acknowledge leaves it open). Reached from the home "🐛 Bug reports"
 *  button, which only shows for admin accounts; the server also gates every endpoint on is_admin. */
export default function BugsAdminPage({
  onBack,
  onOpenReplay,
  onOpenScenario,
}: {
  onBack: () => void
  onOpenReplay: (replay: ReplayRecord) => void
  onOpenScenario: (state: GameState) => void
}) {
  const [list, setList] = useState<AdminBug[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [filter, setFilter] = useState<'open' | 'all'>('open')

  async function refresh() {
    try { setList(await auth.fetchAdminBugs()); setError(null) }
    catch (e: any) { setError(e?.message ?? 'Could not load bug reports.'); setList([]) }
  }
  useEffect(() => { void refresh() }, [])

  async function openReplay(id: string) {
    setBusy(id); setError(null)
    try {
      const full = await auth.fetchAdminBug(id)
      if (full.replay) onOpenReplay(full.replay)
      else setError('That report has no replay attached.')
    } catch (e: any) { setError(e?.message ?? 'Could not open the replay.') }
    finally { setBusy(null) }
  }
  async function openScenario(id: string) {
    setBusy(id); setError(null)
    try {
      const full = await auth.fetchAdminBug(id)
      if (full.scenario) onOpenScenario(full.scenario)
      else setError('That report has no scenario attached.')
    } catch (e: any) { setError(e?.message ?? 'Could not open the scenario.') }
    finally { setBusy(null) }
  }
  async function reply(id: string, kind: 'solved' | 'notbug' | 'ack') {
    setBusy(id); setError(null)
    try {
      await auth.replyBug(id, kind, replyText.trim())
      setReplyFor(null); setReplyText('')
      await refresh()
    } catch (e: any) { setError(e?.message ?? 'Could not send the reply.') }
    finally { setBusy(null) }
  }
  async function remove(id: string) {
    if (!confirm('Delete this bug report? This cannot be undone.')) return
    setBusy(id); setError(null)
    try { await auth.deleteBugReport(id); await refresh() }
    catch (e: any) { setError(e?.message ?? 'Could not delete that report.') }
    finally { setBusy(null) }
  }

  const fmtDate = (ms: number) => new Date(ms).toLocaleString()
  const statusBadge = (s: string) =>
    s === 'solved' ? <span className="badge public" title="Closed — solved">✅ solved</span>
    : s === 'notbug' ? <span className="badge private" title="Closed — not a bug">🚫 not a bug</span>
    : <span className="badge" style={{ background: '#caa94a', color: '#1a1a1a' }} title="Still open">● open</span>

  const shown = (list ?? []).filter((b) => filter === 'all' || b.status === 'open')
  const openCount = (list ?? []).filter((b) => b.status === 'open').length

  return (
    <div className="deckbuilder">
      <div className="db-toolbar">
        <button onClick={onBack}>← Back</button>
        <b>🐛 Bug reports</b>
        <span className="jp-hint">Open a report's replay or its board scenario to reproduce it, then reply to the reporter.</span>
        <label style={{ marginLeft: 'auto', fontSize: 13 }}>
          <input type="checkbox" checked={filter === 'all'} onChange={(e) => setFilter(e.target.checked ? 'all' : 'open')} /> show closed
        </label>
      </div>

      {error && <div className="toast error" style={{ position: 'static', margin: '8px 0' }}>{error}</div>}
      {list === null && <p style={{ opacity: 0.7 }}>Loading…</p>}

      {list !== null && (
        <div className="scenario-list">
          <h3>{filter === 'all' ? `All reports (${list.length})` : `Open reports (${openCount})`}</h3>
          {shown.length === 0 ? (
            <p style={{ opacity: 0.6 }}>{filter === 'all' ? 'No bug reports yet.' : 'No open reports — nice.'}</p>
          ) : shown.map((b) => (
            <div key={b.id} className="scenario-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {statusBadge(b.status)}
                  <b>{b.reporter}</b>
                  <span style={{ opacity: 0.6, fontSize: 12 }}>{b.mode} · {fmtDate(b.createdAt)}</span>
                </div>
                <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{b.message}</div>
                {b.adminMessages.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                    {b.adminMessages.map((m, i) => (
                      <div key={i}>↳ <b>{m.kind === 'solved' ? 'Solved' : m.kind === 'notbug' ? 'Not a bug' : 'Acknowledged'}</b>{m.text ? `: ${m.text}` : ''}</div>
                    ))}
                  </div>
                )}
                {replyFor === b.id && (
                  <div style={{ marginTop: 8 }}>
                    <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={2} maxLength={2000}
                      placeholder="Optional note to the reporter…" style={{ width: '100%', resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <button disabled={busy === b.id} onClick={() => reply(b.id, 'solved')}>✅ Bug solved</button>
                      <button disabled={busy === b.id} onClick={() => reply(b.id, 'notbug')}>🚫 Wasn't a bug</button>
                      <button disabled={busy === b.id} onClick={() => reply(b.id, 'ack')}>👀 Acknowledge (keep open)</button>
                      <button disabled={busy === b.id} onClick={() => { setReplyFor(null); setReplyText('') }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {b.hasReplay && <button disabled={busy === b.id} onClick={() => openReplay(b.id)}>▶ Replay</button>}
                {b.hasScenario && <button disabled={busy === b.id} onClick={() => openScenario(b.id)}>🎬 Scenario</button>}
                {replyFor !== b.id && <button disabled={busy === b.id} onClick={() => { setReplyFor(b.id); setReplyText('') }}>✉ Reply</button>}
                <button disabled={busy === b.id} className="danger" onClick={() => remove(b.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
