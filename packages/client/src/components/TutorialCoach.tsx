import { useEffect, useState, type ReactNode } from 'react'
import { LESSONS } from '../tutorial/lessons'
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
export default function TutorialCoach({ coach, onContinue, onRestart, onExit, onNextLesson }: {
  coach: CoachState
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
  const idx = LESSONS.indexOf(lesson)
  const nextLesson = LESSONS[idx + 1]
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
        <span className="tutcoach-title">🎓 {lesson.title}</span>
        <span className="tutcoach-prog">{lesson.freePlay ? '' : `${Math.min(i + 1, lesson.steps.length)} / ${lesson.steps.length}`}</span>
        <button className="tutcoach-x" onClick={() => setMin(true)} title="Hide the coach">–</button>
      </header>
      <div className="tutcoach-body">
        {complete ? (
          <>
            <p className="tutcoach-done">Lesson complete ✓</p>
            {lesson.freePlay && rich(sayOf(lesson.steps[0], t))}
            {rich(lesson.outro)}
          </>
        ) : (
          <>
            {rich(sayOf(step, t))}
            {step.task && !lesson.freePlay && <p className="tutcoach-task" data-coach-task><span>Your move</span>{step.task}</p>}
            {lost && <p className="tutcoach-lost">{lost} Restart the lesson to try again.</p>}
            {!lost && coach.nope && <p className="tutcoach-nope">{coach.nope}</p>}
          </>
        )}
      </div>
      <footer>
        {complete ? (
          <>
            {nextLesson && <button className="tutcoach-go" data-coach-next onClick={() => onNextLesson(nextLesson.id)}>Next: {nextLesson.title} →</button>}
            <button onClick={onRestart}>{lesson.freePlay ? 'Play again' : 'Repeat'}</button>
            <button onClick={onExit}>Lesson list</button>
          </>
        ) : (
          <>
            {!step.task && <button className="tutcoach-go" data-coach-continue onClick={onContinue}>Continue →</button>}
            <button className={lost ? 'tutcoach-go' : ''} data-coach-restart onClick={onRestart}>Restart</button>
            <button onClick={onExit}>Lesson list</button>
          </>
        )}
      </footer>
    </aside>
  )
}
