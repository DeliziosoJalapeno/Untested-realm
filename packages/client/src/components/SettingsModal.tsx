import { useState } from 'react'
import { sfx, sfxMuted, setSfxMuted } from '../sfx'
import { getSetting, setSetting, type CoordSystem } from '../settings'
import { fmtCoord } from '../coords'

// (0,0), (2,1) and (4,3) rendered in each system — a live preview of what board squares will read as
const COORD_OPTIONS: { value: CoordSystem; label: string }[] = [
  { value: 'chess', label: 'Chess' },
  { value: 'standard', label: 'Standard' },
  { value: 'cartesian', label: 'Cartesian' },
]

/** Small preferences dialog shared by the home screen and the in-game rail. Sound is backed by sfx.ts;
 *  the rest by settings.ts. Both persist immediately, so changes apply without a Save button. */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [sound, setSound] = useState(!sfxMuted())
  const [oppPopup, setOppPopup] = useState(getSetting('opponentPlayPopup'))
  const [coords, setCoords] = useState<CoordSystem>(getSetting('coordSystem'))

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
        <div className="settings-actions"><button onClick={onClose}>Close</button></div>
      </div>
    </>
  )
}
