// A drag handle between two sections of a screen. Dragging reports the movement in pixels since the
// drag began; a double click asks for the default size back. Works with mouse, pen and touch.
import { useRef } from 'react'

export default function Splitter({ dir, onDrag, onStart, onReset, title }: {
  /** 'h': a horizontal bar dragged up and down; 'v': a vertical bar dragged left and right */
  dir: 'h' | 'v'
  /** movement since the drag began (down / right is positive) */
  onDrag: (delta: number) => void
  onStart?: () => void
  onReset?: () => void
  title?: string
}) {
  const from = useRef<number | null>(null)
  return (
    <div
      className={`splitter splitter-${dir}`}
      role="separator"
      aria-orientation={dir === 'h' ? 'horizontal' : 'vertical'}
      title={title ?? 'Drag to resize. Double-click to reset.'}
      onPointerDown={(e) => { from.current = dir === 'h' ? e.clientY : e.clientX; onStart?.(); e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault() }}
      onPointerMove={(e) => { if (from.current !== null) onDrag((dir === 'h' ? e.clientY : e.clientX) - from.current) }}
      onPointerUp={(e) => { from.current = null; e.currentTarget.releasePointerCapture(e.pointerId) }}
      onPointerCancel={() => { from.current = null }}
      onDoubleClick={onReset}
    ><span /></div>
  )
}
