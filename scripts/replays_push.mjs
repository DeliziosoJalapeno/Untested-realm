// Commit and push the saved matches under match-replays/ so they can be reviewed from the repository.
//   npm run replays:push
import { execFileSync } from 'node:child_process'
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()
git('add', '--', 'match-replays')
const staged = git('diff', '--cached', '--name-only', '--', 'match-replays').split('\n').filter(Boolean)
if (!staged.length) { console.log('No new or changed match replays to push.'); process.exit(0) }
const flagged = staged.filter((f) => f.includes('/review/')).length
git('commit', '-m', `Add match replays (${staged.length} file${staged.length === 1 ? '' : 's'}, ${flagged} flagged for review)`, '--', 'match-replays')
console.log(git('push'))
console.log(`Pushed ${staged.length} match replay file(s); ${flagged} in the review queue.`)
