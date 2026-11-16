import { useEffect, useRef, useState } from 'react'
import { CUSTOM_ART_TOKENS, customArtSlug } from '@sorcery/shared'
import * as auth from '../auth'
import type { AdminTokenArt } from '../auth'
import CardImg from './CardImg'

/** Admin-only panel: upload a custom art for a token (Skeleton, Foot Soldier, Frog) and choose which
 *  accounts may use it. Only those players (and admins) are offered it in the deck builder and can start a
 *  game with it; their opponents still see it on the token. Reached from the home "🎨 Token art" button,
 *  which only shows for admin accounts; the server also gates every endpoint on is_admin. */
export default function TokenArtAdminPage({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<AdminTokenArt[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // new-art form
  const [token, setToken] = useState<string>(CUSTOM_ART_TOKENS[0])
  const [label, setLabel] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [newUsers, setNewUsers] = useState('')
  const [fileKey, setFileKey] = useState(0) // bumped after an upload → a fresh (empty) file input
  const reading = useRef<FileReader | null>(null) // only the LATEST pick's read may land
  // per-art edits of the player list (art id → text being edited)
  const [usersEdit, setUsersEdit] = useState<Record<string, string>>({})

  async function refresh() {
    try { setList(await auth.fetchAdminTokenArts()); setError(null) }
    catch (e: any) { setError(e?.message ?? 'Could not load token arts.'); setList([]) }
    void auth.fetchMyTokenArts() // the admin's own deck builder offers every art
  }
  useEffect(() => { void refresh() }, [])

  const splitUsers = (s: string) => s.split(/[\s,]+/).map((n) => n.trim()).filter(Boolean)

  function pickFile(f: File | undefined) {
    setImage(null)
    reading.current = null
    if (!f) return
    if (f.size > 2 * 1024 * 1024) { setError('Images must be 2 MB or smaller.'); return }
    const r = new FileReader()
    reading.current = r
    r.onload = () => { if (reading.current !== r) return; setImage(String(r.result)); setError(null) }
    r.readAsDataURL(f)
  }
  async function create() {
    if (!image) { setError('Choose an image.'); return }
    setBusy('new'); setError(null)
    try {
      await auth.createTokenArt({ token, label: label.trim(), image, users: splitUsers(newUsers) })
      setLabel(''); setImage(null); setNewUsers(''); setFileKey((k) => k + 1)
      await refresh()
    } catch (e: any) { setError(e?.message ?? 'Could not upload the art.') }
    finally { setBusy(null) }
  }
  async function saveUsers(a: AdminTokenArt) {
    setBusy(a.id); setError(null)
    try {
      await auth.updateTokenArt(a.id, { users: splitUsers(usersEdit[a.id] ?? a.users.join(', ')) })
      setUsersEdit(({ [a.id]: _, ...rest }) => rest)
      await refresh()
    } catch (e: any) { setError(e?.message ?? 'Could not save the players.') }
    finally { setBusy(null) }
  }
  async function remove(a: AdminTokenArt) {
    if (!confirm(`Delete the "${a.label}" ${a.token} art? Players using it go back to the default art.`)) return
    setBusy(a.id); setError(null)
    try { await auth.deleteTokenArt(a.id); await refresh() }
    catch (e: any) { setError(e?.message ?? 'Could not delete that art.') }
    finally { setBusy(null) }
  }

  return (
    <div className="deckbuilder tokenart-admin">
      <div className="db-toolbar">
        <button onClick={onBack}>← Back</button>
        <b>🎨 Token art</b>
        <span className="jp-hint">Only the players you list (and admins) can use an art; their opponents see it on the token.</span>
      </div>

      {error && <div className="toast error" style={{ position: 'static', margin: '8px 0' }}>{error}</div>}

      <div className="scenario-list">
        <h3>New art</h3>
        <div className="scenario-row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select value={token} onChange={(e) => setToken(e.target.value)} data-ta-token>
            {CUSTOM_ART_TOKENS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input placeholder="Name (optional)" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
          <input key={fileKey} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => pickFile(e.target.files?.[0])} data-ta-file />
          <input placeholder="Players (usernames, comma-separated)" value={newUsers} onChange={(e) => setNewUsers(e.target.value)} style={{ flex: '1 1 240px' }} data-ta-users />
          <button disabled={busy === 'new' || !image} onClick={create}>⬆ Upload</button>
          {image && <img src={image} alt="preview" className="tokenart-thumb" />}
        </div>

        <h3>Arts ({list?.length ?? 0})</h3>
        {list === null && <p style={{ opacity: 0.7 }}>Loading…</p>}
        {list?.length === 0 && <p style={{ opacity: 0.6 }}>No custom token art yet.</p>}
        {list?.map((a) => (
          <div key={a.id} className="scenario-row" data-ta-art={a.id} style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <CardImg name={a.token} art={customArtSlug(a.id)} className="tokenart-thumb" />
            <div style={{ flex: '0 1 180px', minWidth: 0 }}>
              <b>{a.label}</b>
              <div style={{ opacity: 0.6, fontSize: 12 }}>{a.token}</div>
            </div>
            <input value={usersEdit[a.id] ?? a.users.join(', ')} placeholder="No players yet (admins only)"
              onChange={(e) => setUsersEdit({ ...usersEdit, [a.id]: e.target.value })} style={{ flex: '1 1 240px' }} />
            <button disabled={busy === a.id || usersEdit[a.id] === undefined} onClick={() => saveUsers(a)}>💾 Save players</button>
            <button disabled={busy === a.id} className="danger" onClick={() => remove(a)}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  )
}
