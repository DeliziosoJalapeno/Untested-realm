import { useEffect, useMemo, useRef, useState } from 'react'
import { viewFor, type GameState, type PlayerId } from '@sorcery/shared'
import type { Session } from '../App'
import Game from './Game'
import { replayInitialState, replayStateAt, replayStep, type ReplayRecord } from '../replay'
import { getSetting } from '../settings'

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

  // the control bar is draggable by its grip. Offset is applied via the CSS `translate` property so it
  // composes with the bar's own centering `transform: translateX(-50%)` instead of overwriting it.
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const onGripDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: drag.x, oy: drag.y }
  }
  const onGripMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (d) setDrag({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) })
  }
  const onGripUp = (e: React.PointerEvent) => {
    dragRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

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
  // replay visibility (⚙ Settings): 'off' = spectator (both hands + collections hidden), 'perspective'
  // = watch from one player's side (their cards shown, opponent's hidden; 👁 flips sides), 'on' = reveal
  // the whole game. Spectator uses viewFor(null) so neither hand leaks.
  const replayVis = getSetting('replayVisibility')
  const view = useMemo(
    () =>
      replayVis === 'off'
        ? viewFor(workRef.current, null)
        : viewFor(workRef.current, perspective, { revealAll: replayVis === 'on' }),
    [index, perspective, replayVis],
  )
  // a read-only spectator session: seat null ⇒ the board disables every interaction; view.you keeps
  // the chosen perspective's orientation. No send / undo / chat — purely for watching.
  const session: Session = useMemo(() => ({ kind: 'online', seat: null, view, send: () => {} }), [view])

  return (
    <div className="replay-root">
      <Game session={session} view={view} hotseatViewpoint={null} onLeave={onLeave} mobile={mobile} />
      <div className="replay-bar" style={{ translate: `${drag.x}px ${drag.y}px` }}>
        <span
          className="replay-grip"
          title="Drag to move these controls"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
        >⠿</span>
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
