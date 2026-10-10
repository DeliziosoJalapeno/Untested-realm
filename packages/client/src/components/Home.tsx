import { useEffect, useState } from 'react'
import type { ClockConfig, DeckList } from '@sorcery/shared'
import type { SealedConfig } from '../net'
import { loadDecks } from '../App'
import * as auth from '../auth'
import type { RoomInfo } from '../auth'
import DeckPreview from './DeckPreview'
import CardImg from './CardImg'
import { useMobileMode } from '../mobile'
import { CHANGELOG } from '../changelog'
import { ACHIEVEMENTS } from '@sorcery/shared'
import { unlockedCount } from '../achievements'
import { AchievementsModal } from './Achievements'
import SettingsModal from './SettingsModal'
import { getSetting, subscribeSettings, homepageQualityChosen } from '../settings'

/** live-reactive home-screen quality — re-renders when the setting changes. On MOBILE, until the user
 *  explicitly picks a look, it defaults to 'boring' (the classic page), since the full-bleed art cover
 *  is desktop-oriented. An explicit choice is always honored on both. */
function useHomepageQuality(mobile: boolean) {
  const compute = () => (mobile && !homepageQualityChosen()) ? 'boring' as const : getSetting('homepageQuality')
  const [q, setQ] = useState(compute)
  useEffect(() => {
    setQ(compute())
    return subscribeSettings(() => setQ(compute()))
  }, [mobile])
  return q
}

// Decorative card-art showcase flanking the home page on desktop (hidden on mobile). Four columns —
// two per side — of the TRICKIEST non-site cards: the ones carrying the most engine tests (a proxy for
// how hard their effect was to get right). No Ordinary cards, and vanilla combat-dummy fixtures excluded.
// Each column is top→bottom; row 1 (and the last row) fade under the rail's top/bottom mask, so the
// marquee cards sit in row 2 and a sacrificial card takes the cropped row 1. Edit to re-curate.
const SHOWCASE_COLUMNS: string[][] = [
  ['Fireball', 'Vivien the Enchantress', 'Wildfire', 'Conqueror Worm'],     // left, outer
  ['Giant Shark', 'Magellan Globe', 'Enchantress', 'Crusade'],              // left, inner
  ['Eclipse', 'Hillock Basilisk', 'Chaos Twister', 'Locusts of Illyria'],   // right, inner
  ['Pudge Butcher', 'Imposter', 'Mephistopheles', 'Poisonous Dagger'],      // right, outer
]

/** "25+30" for a base+increment clock, or "untimed" */
function fmtClockCfg(c: { base: number; inc: number } | null): string {
  return c ? `${Math.round(c.base / 60000)}+${Math.round(c.inc / 1000)}` : 'untimed'
}

/** Render the changelog's inline markdown to React nodes: **bold**, *italic*, `code`,
 *  and [text](url). Left-to-right, bold matched before italic so `**x**` isn't split. */
function renderInlineMd(text: string): React.ReactNode[] {
  const re = /\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g
  const nodes: React.ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const bold = m[1] ?? m[2]
    if (bold !== undefined) nodes.push(<strong key={key++}>{bold}</strong>)
    else if (m[3] !== undefined) nodes.push(<em key={key++}>{m[3]}</em>)
    else if (m[4] !== undefined) nodes.push(<code key={key++}>{m[4]}</code>)
    else if (m[5] !== undefined) nodes.push(<a key={key++} href={m[6]} target="_blank" rel="noreferrer">{m[5]}</a>)
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export default function Home({
  username,
  onAuth,
  onHotseat,
  onOnline,
  onSealed,
  onVsBot,
  onDecks,
  onCollection,
  onScenarios,
  onWatchReplay,
  initialRoomCode,
}: {
  username: string | null
  onAuth: (username: string | null) => void
  onHotseat: (a: DeckList, b: DeckList, clock: ClockConfig | null, secondSeer?: boolean) => void
  onOnline: (mode: 'create' | 'join' | 'spectate' | 'matchmake' | 'rejoin', name: string, deck: DeckList | null, code?: string, clock?: ClockConfig | null, isPublic?: boolean, secondSeer?: boolean) => void
  onSealed: (mode: 'create' | 'join', name: string, opts: { cfg?: SealedConfig; code?: string; clock?: ClockConfig | null; isPublic?: boolean; secondSeer?: boolean }) => void
  onVsBot: (mine: DeckList, bot: DeckList, clock: ClockConfig | null, stepBot: boolean, difficulty: 'fast' | 'thinking', secondSeer?: boolean) => void
  onDecks: () => void
  onCollection: () => void
  onScenarios: () => void
  onWatchReplay: () => void
  initialRoomCode?: string | null
}) {
  const decks = loadDecks()
  const { mobile } = useMobileMode()
  const quality = useHomepageQuality(mobile) // 'high' = new cover art + serif title, 'boring' = classic page, 'low' = paint meme cover; mobile defaults to 'boring'
  const [name, setName] = useState(localStorage.getItem('sorcery-name') ?? username ?? '')
  // account form
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authUser, setAuthUser] = useState('')
  const [authPass, setAuthPass] = useState('')
  const [authMsg, setAuthMsg] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [showAchv, setShowAchv] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // gate the Achievements entry: it stays hidden until you've earned at least one
  const achvGot = unlockedCount()
  const achvTotal = ACHIEVEMENTS.length

  async function submitAuth() {
    if (authBusy || !authUser.trim() || !authPass) return
    setAuthBusy(true); setAuthMsg(null)
    try {
      const u = authMode === 'register' ? await auth.register(authUser.trim(), authPass) : await auth.login(authUser.trim(), authPass)
      setAuthPass('')
      await onAuth(u)
    } catch (e: any) {
      setAuthMsg(e?.message ?? 'Something went wrong.')
    } finally {
      setAuthBusy(false)
    }
  }
  async function doLogout() {
    await auth.logout()
    await onAuth(null)
  }
  const [deckId, setDeckId] = useState(decks[0]?.id ?? '')
  const [deckBId, setDeckBId] = useState(decks[1]?.id ?? decks[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [makePublic, setMakePublic] = useState(false)
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null)
  const [myRooms, setMyRooms] = useState<auth.MyRoomInfo[]>([]) // YOUR live games (signed in)
  const [lobbyErr, setLobbyErr] = useState<string | null>(null)
  function refreshRooms() {
    auth.fetchRooms().then((rs) => { setRooms(rs); setLobbyErr(null) }).catch((e) => setLobbyErr(e?.message ?? 'Could not load rooms.'))
    if (username) auth.fetchMyRooms().then(setMyRooms).catch(() => { /* offline */ })
    else setMyRooms([])
  }
  useEffect(() => {
    refreshRooms()
    const id = setInterval(refreshRooms, 5000) // keep the lobby fresh
    return () => clearInterval(id)
    // re-subscribe when you sign in / out, so "🎮 Your games" (account-based, cross-device
    // rejoin) appears the moment you log in — not only after a page reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  // optional chess clock (off by default; enabling defaults to 15 + 30)
  const [stepBot, setStepBot] = useState(false) // pause the computer after each action
  const [botDifficulty, setBotDifficulty] = useState<'fast' | 'thinking'>('thinking') // 'thinking' = strong search bot
  const [clockOn, setClockOn] = useState(false)
  const [baseMin, setBaseMin] = useState(15)
  const [incSec, setIncSec] = useState(30)
  const clockConfig = (): ClockConfig | null =>
    clockOn && baseMin > 0 ? { base: Math.round(baseMin * 60_000), inc: Math.round(Math.max(0, incSec) * 1000) } : null

  // sealed room config (open packs + timed deckbuild)
  const [sealedMode, setSealedMode] = useState(false)
  const [secondSeer, setSecondSeer] = useState(false) // optional rule: 2nd player gets the Seer peek on turn 2
  const [showRoomOpts, setShowRoomOpts] = useState(false) // "Create room" options popup (public/sealed/second seer/clock)
  const [sealEdition, setSealEdition] = useState('Random')
  const [sealPacks, setSealPacks] = useState(6)
  const [sealBuildMin, setSealBuildMin] = useState(20)
  const sealedCfg = (): SealedConfig => ({ edition: sealEdition, numPacks: sealPacks, deckbuildMin: sealBuildMin })

  const deck = decks.find((d) => d.id === deckId) ?? decks[0]
  const deck2 = decks.find((d) => d.id === deckBId) ?? decks[0]

  function remember() {
    localStorage.setItem('sorcery-name', name)
  }

  // every "Start"/"Play" action first opens a full-screen preview of the player's chosen
  // deck; you may switch decks right there, and `go` runs (with the chosen deck) only after
  // you Confirm. Cancel dismisses without launching.
  const [pendingStart, setPendingStart] = useState<{ deck: DeckList; go: (chosen: DeckList) => void } | null>(null)
  const confirmStart = (d: DeckList | undefined, go: (chosen: DeckList) => void) => {
    if (!d) return
    setPendingStart({ deck: d, go })
  }

  if (pendingStart) {
    return (
      <DeckPreview
        deck={pendingStart.deck}
        decks={decks}
        onConfirm={(chosen) => { const go = pendingStart.go; setDeckId(chosen.id ?? deckId); setPendingStart(null); go(chosen) }}
        onCancel={() => setPendingStart(null)}
      />
    )
  }

  return (
    <div className={`home ${quality === 'low' ? 'lq' : quality === 'high' ? 'aq' : 'hq'}`}>
      {/* desktop-only decorative card-art showcase in the empty side margins (4 columns, 2 per side) — the classic ("boring") page only */}
      {!mobile && quality === 'boring' && (
        <>
          <aside className="home-artrail left" aria-hidden="true">
            {SHOWCASE_COLUMNS.slice(0, 2).map((col, i) => (
              <div className="home-artcol" key={i}>
                {col.map((n) => <CardImg key={n} name={n} className="showcase-card" />)}
              </div>
            ))}
          </aside>
          <aside className="home-artrail right" aria-hidden="true">
            {SHOWCASE_COLUMNS.slice(2, 4).map((col, i) => (
              <div className="home-artcol" key={i}>
                {col.map((n) => <CardImg key={n} name={n} className="showcase-card" />)}
              </div>
            ))}
          </aside>
        </>
      )}
      {quality === 'low' ? (
        <div className="home-titlewrap">
          <img className="home-title" src="/titolosorcery.png" alt="Untested Realm" />
        </div>
      ) : (
        <h1>Untested Realm</h1>
      )}
      {quality === 'high' && (
        <a className="art-credit" href="https://www.instagram.com/elispeedart/" target="_blank" rel="noreferrer noopener" title="Cover art by elispeedart (Instagram)">
          art by @elispeedart (wip)
        </a>
      )}
      <p className="byline">by Jalapeno</p>
      <p className="subtitle">
        100% automated, 99%* verified!
        <br />
        <button className="linklike changelog-open" onClick={() => setShowChangelog(true)}>
          📜 What’s new (v{CHANGELOG[0].version})
        </button>
        <br />
        <span className="socials">
            <a className="brand-link" href="https://github.com/DeliziosoJalapeno/Untested-realm" target="_blank" rel="noreferrer noopener" aria-label="GitHub" title="View the source on GitHub">
              <svg viewBox="0 0 16 16" width="19" height="19" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
            <a className="brand-link" href="https://discord.gg/Kts7yXhjx" target="_blank" rel="noreferrer noopener" aria-label="Discord" title="Join the Discord">
              <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
              </svg>
            </a>
        </span>
      </p>

      {showAchv && <AchievementsModal onClose={() => setShowAchv(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {showRoomOpts && (
        <div className="changelog-overlay" data-overlay="roomopts" onClick={() => setShowRoomOpts(false)}>
          <div className="roomopts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="changelog-head">
              <h2>Create a room</h2>
              <button className="changelog-close" data-close="1" onClick={() => setShowRoomOpts(false)} title="Close">✕</button>
            </div>
            <div className="roomopts-body">
              <label title="Public rooms appear in the lobby for anyone to join or spectate. Private rooms are shareable only via their link.">
                <input type="checkbox" checked={makePublic} onChange={(e) => setMakePublic(e.target.checked)} /> <span className="opt-name">public</span>
                <span className="opt-desc">listed in the lobby for anyone to join or spectate</span>
              </label>
              <label title="Sealed: open packs and build a deck on the spot against a timer, instead of bringing a deck.">
                <input type="checkbox" checked={sealedMode} onChange={(e) => setSealedMode(e.target.checked)} /> <span className="opt-name">🎴 sealed</span>
                <span className="opt-desc">open packs and build on a timer (no deck needed)</span>
              </label>
              <label title="Optional rule — the player going SECOND is granted the Seer avatar's peek (look at the top of your spellbook or atlas, keep it or bottom it) on their first turn (turn 2).">
                <input type="checkbox" checked={secondSeer} onChange={(e) => setSecondSeer(e.target.checked)} /> <span className="opt-name">🔮 second seer</span>
                <span className="opt-desc">the 2nd player gets the Seer peek on turn 2</span>
              </label>
              <div className="clockcfg">
                <label><input type="checkbox" checked={clockOn} onChange={(e) => setClockOn(e.target.checked)} /> ⏱ Clock</label>
                {clockOn && (
                  <>
                    <input type="number" min={0} value={baseMin} onChange={(e) => setBaseMin(Number(e.target.value))} style={{ width: '3.5em' }} /> min
                    <span className="or">+</span>
                    <input type="number" min={0} value={incSec} onChange={(e) => setIncSec(Number(e.target.value))} style={{ width: '3.5em' }} /> s/turn
                    <button onClick={() => { setBaseMin(5); setIncSec(15) }}>5+15</button>
                    <button onClick={() => { setBaseMin(15); setIncSec(30) }}>15+30</button>
                    <button onClick={() => { setBaseMin(30); setIncSec(30) }}>30+30</button>
                  </>
                )}
              </div>
              {sealedMode && (
                <div className="sealcfg">
                  <span className="or">sealed:</span>
                  <label>
                    <select value={sealEdition} onChange={(e) => setSealEdition(e.target.value)}>
                      {['Random', 'Alpha', 'Beta', 'Arthurian Legends', 'Gothic'].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                  <label>×<input type="number" min={1} max={12} value={sealPacks} onChange={(e) => setSealPacks(Math.min(12, Math.max(1, Number(e.target.value) || 6)))} style={{ width: '3.5em' }} /> packs</label>
                  <label>🛠 <input type="number" min={1} max={60} value={sealBuildMin} onChange={(e) => setSealBuildMin(Math.min(60, Math.max(1, Number(e.target.value) || 20)))} style={{ width: '3.5em' }} /> min to build</label>
                  <span title="The in-game play clock uses the ⏱ Clock setting above.">play clock: <b>{fmtClockCfg(clockConfig())}</b></span>
                </div>
              )}
            </div>
            <div className="roomopts-foot">
              {sealedMode ? (
                <button onClick={() => { setShowRoomOpts(false); remember(); onSealed('create', username || name || 'Player 1', { cfg: sealedCfg(), clock: clockConfig(), isPublic: makePublic, secondSeer }) }}>
                  Create {makePublic ? 'public ' : 'private '}sealed room
                </button>
              ) : (
                <button disabled={!deck} onClick={() => { setShowRoomOpts(false); confirmStart(deck, (d) => { remember(); onOnline('create', username || name || 'Player 1', d, undefined, clockConfig(), makePublic, secondSeer) }) }}>
                  Create {makePublic ? 'public ' : 'private '}room
                </button>
              )}
              <button data-cancel="1" onClick={() => setShowRoomOpts(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showChangelog && (
        <div className="changelog-overlay" data-overlay="changelog" onClick={() => setShowChangelog(false)}>
          <div className="changelog-modal" onClick={(e) => e.stopPropagation()}>
            <div className="changelog-head">
              <h2>Changelog</h2>
              <button className="changelog-close" data-close="1" onClick={() => setShowChangelog(false)} title="Close">✕</button>
            </div>
            <div className="changelog-body">
              {CHANGELOG.map((entry, i) => (
                <details key={entry.version} open={i === 0} className="changelog-entry">
                  <summary>
                    <span className="cl-version">v{entry.version}</span>
                    {entry.date && <span className="cl-date">{entry.date}</span>}
                    <span className="cl-count">{entry.changes.length} change{entry.changes.length === 1 ? '' : 's'}</span>
                  </summary>
                  {entry.sections.map((section, s) => (
                    <div key={s} className="cl-section">
                      {section.title && <h4 className="cl-section-title">{renderInlineMd(section.title)}</h4>}
                      <ul>
                        {section.changes.map((c, j) => (
                          <li key={j}>{renderInlineMd(c)}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </details>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="disclaimer">
        <p>
          Untested Realm is an unofficial, non-commercial fan project. It is not affiliated
          with, endorsed by, sponsored by, or associated with Erik's Curiosa Ltd, Curiosa, or
          Sorcery: Contested Realm.
        </p>
        <p>
          All card names, artwork, game rules, and related marks are the property of Erik's
          Curiosa Ltd and used under nominative fair use to enable community play.
        </p>
      </div>

      <div className="panel account">
        {username ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>Signed in as <b>{username}</b> — your decks sync to your account.</span>
            <button onClick={doLogout}>Log out</button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b>{authMode === 'register' ? 'Create account' : 'Sign in'}</b>
              <input value={authUser} onChange={(e) => setAuthUser(e.target.value)} placeholder="username" maxLength={24}
                onKeyDown={(e) => { if (e.key === 'Enter') submitAuth() }} />
              <input type="password" value={authPass} onChange={(e) => setAuthPass(e.target.value)} placeholder="password"
                onKeyDown={(e) => { if (e.key === 'Enter') submitAuth() }} />
              <button onClick={submitAuth} disabled={authBusy || !authUser.trim() || !authPass}>
                {authBusy ? '…' : authMode === 'register' ? 'Register' : 'Log in'}
              </button>
              <button className="linklike" onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setAuthMsg(null) }}>
                {authMode === 'register' ? 'have an account? Sign in' : 'new? Create account'}
              </button>
            </div>
            {authMsg && <div style={{ color: '#ff9a9a', fontSize: 13, marginTop: 6 }}>{authMsg}</div>}
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Optional — you can play without an account; signing in saves your decks to the server.</div>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Your setup</h2>
        <label>
          Player name{' '}
          {username ? (
            <span title="Signed in — online games use your account name"><b>{username}</b> <span style={{ opacity: 0.6, fontSize: 12 }}>(account)</span></span>
          ) : (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" maxLength={24} />
          )}
        </label>
        <label>
          Deck{' '}
          <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <button onClick={onDecks}>Deck builder</button>
        <button onClick={onCollection}>🎴 Collection & packs</button>
        <button onClick={onScenarios}>🎬 Scenarios</button>
        <button onClick={onWatchReplay}>▶ Watch a replay</button>
        <button onClick={() => setShowSettings(true)}>⚙ Settings</button>
        {achvGot > 0 && (
          <button onClick={() => setShowAchv(true)}>🏆 Achievements {achvGot}/{achvTotal}</button>
        )}
        <div className="clockcfg">
          <label>
            <input type="checkbox" checked={clockOn} onChange={(e) => setClockOn(e.target.checked)} /> ⏱ Clock
          </label>
          {clockOn && (
            <>
              <input type="number" min={0} value={baseMin} onChange={(e) => setBaseMin(Number(e.target.value))} style={{ width: '3.5em' }} /> min
              <span className="or">+</span>
              <input type="number" min={0} value={incSec} onChange={(e) => setIncSec(Number(e.target.value))} style={{ width: '3.5em' }} /> s/turn
              <button onClick={() => { setBaseMin(5); setIncSec(15) }}>5+15</button>
              <button onClick={() => { setBaseMin(15); setIncSec(30) }}>15+30</button>
              <button onClick={() => { setBaseMin(30); setIncSec(30) }}>30+30</button>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Play online</h2>
        {username && myRooms.length > 0 && (
          <div className="mygames">
            <b>🎮 Your games — rejoin from anywhere</b>
            {myRooms.map((r) => (
              <div key={r.id} className="mygames-row" data-mygame={r.id}>
                <span className="lobby-who">
                  {r.mode === 'sealed' ? '🎴 ' : ''}{r.opponent ? `vs ${r.opponent}` : 'waiting for opponent'}
                  {' · '}{r.inProgress ? 'in progress' : r.mode === 'sealed' ? 'building decks' : 'waiting'}
                </span>
                <button onClick={() => { remember(); onOnline('rejoin', username || name || 'Player', null, r.id) }}>↩ Rejoin</button>
                <button
                  className="mygames-close"
                  title="Close (delete) this room"
                  onClick={async () => {
                    setMyRooms((cur) => cur.filter((x) => x.id !== r.id)) // optimistic
                    await auth.closeRoomById(r.id)
                    refreshRooms()
                  }}
                >✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="online-actions">
          <button
            className="autobattle"
            disabled={!deck}
            title="Match with the next player looking for a game (Constructed, clock 25 + 30)"
            onClick={() => confirmStart(deck, (d) => {
              remember()
              onOnline('matchmake', username || name || 'Player', d)
            })}
          >
            ⚔ Find a battle
          </button>
          <span className="or">— or —</span>
          <button onClick={() => setShowRoomOpts(true)}>Create room…</button>
        </div>

        <div className="joincode">
          <span className="or">have a code?</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength={4} style={{ width: '7em' }} />
          <button
            disabled={(!deck && !sealedMode) || code.length !== 4}
            onClick={() => sealedMode
              ? (remember(), onSealed('join', username || name || 'Player 2', { code }))
              : confirmStart(deck, (d) => { remember(); onOnline('join', username || name || 'Player 2', d, code) })}
          >
            Join by code
          </button>
          <button
            disabled={code.length !== 4}
            title="Watch a game (no deck needed)"
            onClick={() => onOnline('spectate', name || 'Spectator', null, code)}
          >
            👁 Spectate
          </button>
        </div>

        {initialRoomCode && (
          <div className="roominvite" data-room-invite={initialRoomCode}>
            🔗 You’re invited to a room —{' '}
            <button
              disabled={!deck}
              title={deck ? undefined : 'Pick a deck first'}
              onClick={() => confirmStart(deck, (d) => { remember(); onOnline('join', username || name || 'Player 2', d, initialRoomCode) })}
            >
              Join
            </button>{' '}
            <button title="Watch (no deck needed)" onClick={() => onOnline('spectate', name || 'Spectator', null, initialRoomCode)}>👁 Spectate</button>
          </div>
        )}

        <div className="lobby">
          <div className="lobby-head">
            <b>Public rooms</b>
            <button onClick={refreshRooms}>⟳ Refresh</button>
          </div>
          {lobbyErr && <div className="jp-hint">{lobbyErr}</div>}
          {rooms === null ? (
            <p style={{ opacity: 0.6 }}>Loading…</p>
          ) : rooms.length === 0 ? (
            <p style={{ opacity: 0.6 }}>No public rooms right now — tick “public” and create one, or ⚔ find a battle.</p>
          ) : (
            <div className="lobby-list" data-lobby>
              {rooms.map((r) => {
                const isSealed = r.mode === 'sealed'
                return (
                <div key={r.id} className="lobby-row" data-room={r.id}>
                  <span className="lobby-who">{r.origin === 'battle' ? '⚔ ' : ''}{r.host}{r.opponent ? ` vs ${r.opponent}` : ''}</span>
                  <span className={`lobby-mode ${isSealed ? 'sealed' : 'constructed'}`} title={isSealed ? `Sealed — ${r.sealed?.numPacks ?? '?'}× ${r.sealed?.edition ?? '?'}` : 'Constructed (bring your own deck)'}>
                    {isSealed ? `🎴 Sealed` : '📖 Constructed'}
                  </span>
                  <span className="lobby-clock" title="Clock (min + s/turn)">⏱ {fmtClockCfg(r.clock)}</span>
                  <span className="lobby-status">{r.inProgress ? 'in progress' : r.joinable ? 'waiting' : 'full'}</span>
                  {r.joinable ? (
                    isSealed ? (
                      <button title="Join this sealed room (no deck needed — you'll open packs)" onClick={() => { remember(); onSealed('join', username || name || 'Player 2', { code: r.id }) }}>
                        Join
                      </button>
                    ) : (
                      <button
                        disabled={!deck}
                        title={deck ? undefined : 'Pick a deck first'}
                        onClick={() => confirmStart(deck, (d) => { remember(); onOnline('join', username || name || 'Player 2', d, r.id) })}
                      >
                        Join
                      </button>
                    )
                  ) : (
                    <button title="Watch this game (no deck needed)" onClick={() => onOnline('spectate', name || 'Spectator', null, r.id)}>👁 Spectate</button>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Play vs Computer</h2>
        <label>
          Computer's deck{' '}
          <select value={deckBId} onChange={(e) => setDeckBId(e.target.value)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label title="Fast = an instant, casual opponent. Thinking = the strong search AI; it plans for up to 30s on its turn (a 'Computer is thinking…' indicator shows while it does — the game stays responsive).">
          Difficulty{' '}
          <select value={botDifficulty} onChange={(e) => setBotDifficulty(e.target.value as 'fast' | 'thinking')}>
            <option value="fast">🙂 Fast (casual)</option>
            <option value="thinking">🧠 Thinking (strong)</option>
          </select>
        </label>
        <label title="The computer pauses after each of its actions until you click ▶ Next — a calmer pace to follow along.">
          <input type="checkbox" checked={stepBot} onChange={(e) => setStepBot(e.target.checked)} /> ⏸ Step through the computer's turns
        </label>
        <label title="Optional rule — the player going SECOND (whoever that is at random) is granted the Seer avatar's peek on their first turn (turn 2).">
          <input type="checkbox" checked={secondSeer} onChange={(e) => setSecondSeer(e.target.checked)} /> 🔮 second seer
        </label>
        <button disabled={!deck || !deck2} onClick={() => confirmStart(deck, (d) => onVsBot(d, deck2!, clockConfig(), stepBot, botDifficulty, secondSeer))}>
          Start game vs Computer
        </button>
      </div>

      <div className="panel">
        <h2>Hotseat (two players, one screen)</h2>
        <label>
          Player 2 deck{' '}
          <select value={deckBId} onChange={(e) => setDeckBId(e.target.value)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <button disabled={!deck || !deck2} onClick={() => confirmStart(deck, (d) => onHotseat(d, deck2!, clockConfig(), secondSeer))}>
          Start hotseat game
        </button>
      </div>
    </div>
  )
}
