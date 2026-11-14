import { useEffect, useState, type ReactNode } from 'react'
import { sayOf, type Lesson } from '../tutorial/runner'
import type { Tut } from '../tutorial/scene'

export interface CoachState {
  lesson: Lesson
  /** current step index; === lesson.steps.length when the lesson is complete */
  i: number
  t: Tut
  /** why the last attempted action was refused */
  nope: string | null
}

/** **bold** → <strong>; blank line → paragraph; a leading "• " keeps its own line */
function rich(text: string): ReactNode {
  return text.split(/\n\n+/).map((para, k) => (
    <p key={k}>
      {para.split('\n').map((line, j) => (
        <span key={j}>
          {j > 0 && <br />}
          {line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, m) =>
            part.startsWith('**') ? <strong key={m}>{part.slice(2, -2)}</strong>
              : part.startsWith('*') && part.length > 2 ? <em key={m}>{part.slice(1, -1)}</em>
                : part)}
        </span>
      ))}
    </p>
  ))
}

/** The coach: a panel beside the board that explains the current step, names the one thing to do,
 *  and pulses the cards and squares involved. */
export default function TutorialCoach({ coach, series, onContinue, onRestart, onExit, onNextLesson }: {
  coach: CoachState
  /** the list this session belongs to (lessons or puzzles): decides what "next" is */
  series: Lesson[]
  onContinue: () => void
  onRestart: () => void
  onExit: () => void
  onNextLesson: (id: string) => void
}) {
  const { lesson, i, t } = coach
  const [min, setMin] = useState(false)
  const step = lesson.steps[i]
  const complete = i >= lesson.steps.length
  const lost = !complete && step?.lost ? step.lost(t) : null
  const nextLesson = series[series.indexOf(lesson) + 1]
  const pz = lesson.puzzle
  const listLabel = pz ? 'Puzzle list' : 'Lesson list'
  // hints are revealed one at a time; the solution only on request. Both reset with the puzzle.
  const [hints, setHints] = useState(0)
  const [solution, setSolution] = useState(false)
  useEffect(() => { setHints(0); setSolution(false) }, [lesson, t])
  const spots = !complete && !min && step?.spot ? step.spot(t).join('|') : ''

  // pulse the things this step talks about. Re-applied after every render: the board re-creates its
  // elements as the game changes.
  useEffect(() => {
    const els: Element[] = []
    for (const sel of spots ? spots.split('|') : []) {
      try { document.querySelectorAll(sel).forEach((el) => { el.classList.add('tut-spot'); els.push(el) }) } catch { /* a bad selector highlights nothing */ }
    }
    return () => { for (const el of els) el.classList.remove('tut-spot') }
  })

  if (min) {
    return <button className="tutcoach tutcoach-min" onClick={() => setMin(false)} title="Show the coach">🎓 Coach</button>
  }
  return (
    <aside className="tutcoach" data-coach-step={complete ? 'done' : i} data-coach-kind={complete ? 'done' : step?.task ? 'task' : 'read'}>
      <header>
        <span className="tutcoach-title">{pz ? '🧩' : '🎓'} {lesson.title}</span>
        <span className="tutcoach-prog">{pz ? '★'.repeat(pz.stars) + '☆'.repeat(3 - pz.stars) : lesson.freePlay ? '' : `${Math.min(i + 1, lesson.steps.length)} / ${lesson.steps.length}`}</span>
        <button className="tutcoach-x" onClick={() => setMin(true)} title="Hide the coach">–</button>
      </header>
      <div className="tutcoach-body">
        {complete ? (
          <>
            <p className="tutcoach-done">{pz ? 'Solved ✓' : 'Lesson complete ✓'}</p>
            {lesson.freePlay && rich(sayOf(lesson.steps[0], t))}
            {rich(lesson.outro)}
          </>
        ) : (
          <>
            {rich(sayOf(step, t))}
            {step.task && !lesson.freePlay && !pz && <p className="tutcoach-task" data-coach-task><span>Your move</span>{step.task}</p>}
            {pz && pz.hints.slice(0, hints).map((h, k) => <p key={k} className="tutcoach-hint" data-coach-hint><span>Hint {k + 1}</span>{h}</p>)}
            {pz && solution && <div className="tutcoach-solution" data-coach-solution><span>Solution</span>{rich(pz.solution)}</div>}
            {lost && <p className="tutcoach-lost">{lost} Restart the lesson to try again.</p>}
            {!lost && coach.nope && <p className="tutcoach-nope">{coach.nope}</p>}
          </>
        )}
      </div>
      <footer>
        {complete ? (
          <>
            {nextLesson && <button className="tutcoach-go" data-coach-next onClick={() => onNextLesson(nextLesson.id)}>Next: {nextLesson.title} →</button>}
            <button onClick={onRestart}>{lesson.freePlay ? 'Play again' : pz ? 'Try again' : 'Repeat'}</button>
            <button onClick={onExit}>{listLabel}</button>
          </>
        ) : (
          <>
            {!step.task && <button className="tutcoach-go" data-coach-continue onClick={onContinue}>Continue →</button>}
            {pz && hints < pz.hints.length && !solution && <button data-coach-hint-btn onClick={() => setHints(hints + 1)}>Hint{hints ? ` ${hints + 1}` : ''}</button>}
            {pz && !solution && <button data-coach-solution-btn onClick={() => setSolution(true)}>Solution</button>}
            <button className={lost ? 'tutcoach-go' : ''} data-coach-restart onClick={onRestart}>Restart</button>
            <button onClick={onExit}>{listLabel}</button>
          </>
        )}
      </footer>
    </aside>
  )
}
