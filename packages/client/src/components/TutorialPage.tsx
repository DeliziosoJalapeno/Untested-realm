import { LESSONS } from '../tutorial/lessons'
import { lessonsDone } from '../tutorial/progress'

/** The lesson list: every chapter of the tutorial series, with what each lesson covers and
 *  which ones this browser has completed. */
export default function TutorialPage({ onBack, onStart }: { onBack: () => void; onStart: (lessonId: string) => void }) {
  const done = lessonsDone()
  const chapters = [...new Set(LESSONS.map((l) => l.chapter))]
  const next = LESSONS.find((l) => !done.has(l.id))
  return (
    <div className="tutpage">
      <div className="tutpage-head">
        <button onClick={onBack}>← Back</button>
        <h1>Learn to play</h1>
        <span className="tutpage-count">{done.size} of {LESSONS.length} lessons complete</span>
      </div>
      <p className="tutpage-intro">
        A coach walks you through Sorcery one rule at a time, on real boards with the real rules engine. Lessons are short and can be taken in any order;
        the last one is a full game with advice as you play.
      </p>
      {next && (
        <button className="tutpage-next" onClick={() => onStart(next.id)}>
          {done.size ? 'Continue' : 'Start'}: {next.title} →
        </button>
      )}
      {chapters.map((ch) => (
        <section key={ch} className="tutchapter">
          <h2>{ch}</h2>
          <div className="tutlessons">
            {LESSONS.filter((l) => l.chapter === ch).map((l) => (
              <button key={l.id} className={`tutlesson ${done.has(l.id) ? 'is-done' : ''}`} data-lesson={l.id} onClick={() => onStart(l.id)}>
                <span className="tutlesson-n">{done.has(l.id) ? '✓' : LESSONS.indexOf(l) + 1}</span>
                <span className="tutlesson-body">
                  <span className="tutlesson-title">{l.title}</span>
                  <span className="tutlesson-blurb">{l.blurb}</span>
                  <span className="tutlesson-covers">{l.covers.join(' · ')}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
