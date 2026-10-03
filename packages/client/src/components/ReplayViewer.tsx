import { useEffect, useMemo, useRef, useState } from 'react'
import { viewFor, type GameState, type PlayerId } from '@sorcery/shared'
import type { Session } from '../App'
import Game from './Game'
import { replayInitialState, replayStateAt, replayStep, type ReplayRecord } from '../replay'

const SPEEDS = [
  { label: '1×', ms: 2000 },
  { label: '2×', ms: 1000 },
  { label: '4×', ms: 500 },
]

/** Watch a recorded game back: re-runs the action log at a steady pace over a read-only board,
 *  with play/pause, speed, step, and a scrubber. The whole game is revealed (both hands). */
export default function ReplayViewer({ replay, onLeave, mobile }: { replay: ReplayRecord; onLeave: () => void; mobile?: boolean }) {
  const total = replay.actions.length
  const workRef = useRef<GameState>(replayInitialState(replay))
  const idxRef = useRef(0)
  const [index, setIndex] = useState(0) // actions applied so far (0..total); drives re-render
  const [playing, setPlaying] = useState(false)
  const [speedMs, setSpeedMs] = useState(2000)
  const [perspective, setPerspective] = useState<PlayerId>(0)

  const rebuildTo = (n: number) => {
    const clamped = Math.max(0, Math.min(n, total))
    workRef.current = replayStateAt(replay, clamped)
    idxRef.current = clamped
    setIndex(clamped)
  }
  const stepForward = () => {
    if (idxRef.current >= total) { setPlaying(false); return }
    replayStep(replay, workRef.current, idxRef.current) // incremental: apply just the next action
    idxRef.current += 1
    setIndex(idxRef.current)
  }
  const stepBack = () => { if (idxRef.current > 0) rebuildTo(idxRef.current - 1) }

  // auto-advance: re-armed after each step (index change) while playing
  useEffect(() => {
    if (!playing) return
    if (idxRef.current >= total) { setPlaying(false); return }
    const id = setTimeout(stepForward, speedMs)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, speedMs])

  const atEnd = index >= total
  const view = useMemo(() => viewFor(workRef.current, perspective, { revealAll: true }), [index, perspective])
  // a read-only spectator session: seat null ⇒ the board disables every interaction; view.you keeps
  // the chosen perspective's orientation. No send / undo / chat — purely for watching.
  const session: Session = useMemo(() => ({ kind: 'online', seat: null, view, send: () => {} }), [view])

  return (
    <div className="replay-root">
      <Game session={session} view={view} hotseatViewpoint={null} onLeave={onLeave} mobile={mobile} />
      <div className="replay-bar">
        <button className="replay-btn" title="Restart" onClick={() => { setPlaying(false); rebuildTo(0) }}>⏮</button>
        <button className="replay-btn" title="Step back" onClick={() => { setPlaying(false); stepBack() }} disabled={index === 0}>◀</button>
        <button className="replay-btn replay-play" title={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)} disabled={atEnd}>
          {playing ? '⏸' : '▶'}
        </button>
        <button className="replay-btn" title="Step forward" onClick={() => { setPlaying(false); stepForward() }} disabled={atEnd}>▶▍</button>
        <input
          className="replay-scrub"
          type="range"
          min={0}
          max={total}
          value={index}
          onChange={(e) => { setPlaying(false); rebuildTo(Number(e.target.value)) }}
        />
        <span className="replay-count">{index} / {total}{atEnd ? ' · end' : ''}</span>
        <div className="replay-speeds">
          {SPEEDS.map((s) => (
            <button key={s.ms} className={`replay-btn ${speedMs === s.ms ? 'selected' : ''}`} onClick={() => setSpeedMs(s.ms)}>{s.label}</button>
          ))}
        </div>
        <button className="replay-btn" title="Flip perspective" onClick={() => setPerspective((p) => (1 - p) as PlayerId)}>
          👁 {replay.names[perspective]}
        </button>
        <button className="replay-btn replay-exit" title="Exit replay" onClick={onLeave}>✕</button>
      </div>
    </div>
  )
}
