import { useState } from 'react'
import { sfx, sfxMuted, setSfxMuted } from '../sfx'
import { getSetting, setSetting } from '../settings'

/** Small preferences dialog shared by the home screen and the in-game rail. Sound is backed by sfx.ts;
 *  the rest by settings.ts. Both persist immediately, so changes apply without a Save button. */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [sound, setSound] = useState(!sfxMuted())
  const [oppPopup, setOppPopup] = useState(getSetting('opponentPlayPopup'))

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
        <div className="settings-actions"><button onClick={onClose}>Close</button></div>
      </div>
    </>
  )
}
