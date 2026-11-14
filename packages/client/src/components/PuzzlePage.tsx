import { PUZZLES } from '../puzzle/puzzles'
import { puzzlesSolved } from '../tutorial/progress'

/** The puzzle page: "win this turn" positions, easiest first. */
export default function PuzzlePage({ onBack, onStart }: { onBack: () => void; onStart: (puzzleId: string) => void }) {
  const solved = puzzlesSolved()
  return (
    <div className="tutpage">
      <div className="tutpage-head">
        <button onClick={onBack}>← Back</button>
        <h1>Puzzles</h1>
        <span className="tutpage-count">{solved.size} of {PUZZLES.length} solved</span>
      </div>
      <p className="tutpage-intro">
        One board, one hand, one turn. In every puzzle the opposing Avatar is at Death's Door, so a single point of damage to it wins — and the
        opponent will defend as well as the rules allow. Each puzzle has hints if you want them, and the full solution with the reasoning behind it.
      </p>
      <div className="tutlessons">
        {PUZZLES.map((p, i) => (
          <button key={p.id} className={`tutlesson ${solved.has(p.id) ? 'is-done' : ''}`} data-lesson={p.id} onClick={() => onStart(p.id)}>
            <span className="tutlesson-n">{solved.has(p.id) ? '✓' : i + 1}</span>
            <span className="tutlesson-body">
              <span className="tutlesson-title">{p.title} <span className="puzzle-stars" title={`Difficulty ${p.puzzle!.stars} of 3`}>{'★'.repeat(p.puzzle!.stars)}{'☆'.repeat(3 - p.puzzle!.stars)}</span></span>
              <span className="tutlesson-blurb">{p.blurb}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
