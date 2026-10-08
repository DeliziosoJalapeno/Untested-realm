import { useState } from 'react'
import { sfx, sfxMuted, setSfxMuted } from '../sfx'
import { getSetting, setSetting, markHomepageQualityChosen, type CoordSystem, type ReplayVisibility, type HomepageQuality } from '../settings'
import { fmtCoord } from '../coords'
import { markUnlocked } from '../achievements'

const HOMEPAGE_OPTIONS: { value: HomepageQuality; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'boring', label: 'Boring' },
  { value: 'low', label: 'Low' },
]

// (0,0), (2,1) and (4,3) rendered in each system — a live preview of what board squares will read as
const COORD_OPTIONS: { value: CoordSystem; label: string }[] = [
  { value: 'chess', label: 'Chess' },
  { value: 'standard', label: 'Standard' },
  { value: 'cartesian', label: 'Cartesian' },
]
// how much a replay reveals: spectator (both hands hidden) / one player's side / everything
const REPLAY_OPTIONS: { value: ReplayVisibility; label: string }[] = [
  { value: 'off', label: 'Spectator' },
  { value: 'perspective', label: 'Player' },
  { value: 'on', label: 'Reveal all' },
]

/** Small preferences dialog shared by the home screen and the in-game rail. Sound is backed by sfx.ts;
 *  the rest by settings.ts. Both persist immediately, so changes apply without a Save button. */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [sound, setSound] = useState(!sfxMuted())
  const [oppPopup, setOppPopup] = useState(getSetting('opponentPlayPopup'))
  const [coords, setCoords] = useState<CoordSystem>(getSetting('coordSystem'))
  const [replayVis, setReplayVis] = useState<ReplayVisibility>(getSetting('replayVisibility'))
  const [quality, setQuality] = useState<HomepageQuality>(getSetting('homepageQuality'))

  function chooseQuality(q: HomepageQuality) {
    setQuality(q)
    markHomepageQualityChosen() // BEFORE setSetting: an explicit pick is honored everywhere (incl. mobile,
    setSetting('homepageQuality', q) // which otherwise defaults to 'boring'); setSetting notifies the live home screen
    // switching to the hand-drawn meme cover earns the "Paint supremacy" achievement
    if (q === 'low') {
      const fresh = markUnlocked(['paint-supremacy'])
      if (fresh.length) window.dispatchEvent(new CustomEvent('achv-earned', { detail: fresh }))
    }
  }

  return (
    <>
      <div className="settings-backdrop" onClick={onClose} />
      <div className="modal settings-modal">
        <h3>⚙ Settings</h3>
        <label className="settings-row" title="Card sounds: draw, play, tap, shuffle, turn chime, etc.">
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => { const on = e.target.checked; setSound(on); setSfxMuted(!on); if (on) sfx('cuckoo') }}
          />
          <span>🔊 Sound effects</span>
        </label>
        <label className="settings-row" title="The big card popup shown in the centre when your opponent plays a card.">
          <input
            type="checkbox"
            checked={oppPopup}
            onChange={(e) => { setOppPopup(e.target.checked); setSetting('opponentPlayPopup', e.target.checked) }}
          />
          <span>🎴 Popup when the opponent plays a card</span>
        </label>
        <div className="settings-row settings-coords" title="How much a replay reveals. Spectator: both players' hands & collections hidden. Player: watch from one side — their cards shown, the opponent's hidden (use the replay's 👁 flip to switch). Reveal all: see everything.">
          <span>👁 Replay visibility</span>
          <div className="coord-choices">
            {REPLAY_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`coord-choice ${replayVis === o.value ? 'selected' : ''}`}
                onClick={() => { setReplayVis(o.value); setSetting('replayVisibility', o.value) }}
              >
                <span className="coord-name">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row settings-coords" title="How board squares are named everywhere — the board overlay, the game log, and prompts (e.g. a movement path).">
          <span>🧭 Board coordinates</span>
          <div className="coord-choices">
            {COORD_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`coord-choice ${coords === o.value ? 'selected' : ''}`}
                onClick={() => { setCoords(o.value); setSetting('coordSystem', o.value) }}
              >
                <span className="coord-name">{o.label}</span>
                <span className="coord-sample">{fmtCoord(2, 1, o.value)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row settings-coords" title="Home-screen look.">
          <span>🖼 Homepage quality</span>
          <div className="coord-choices">
            {HOMEPAGE_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`coord-choice ${quality === o.value ? 'selected' : ''}`}
                onClick={() => chooseQuality(o.value)}
              >
                <span className="coord-name">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="settings-actions"><button onClick={onClose}>Close</button></div>
      </div>
    </>
  )
}
