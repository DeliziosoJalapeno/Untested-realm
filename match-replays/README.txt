Saved matches from games played on this machine.

  review/   games with at least one flagged moment (the Flag button in a game) - the review queue
  games/    every other finished local game

Files are written automatically by the local server when a game against the computer or a hotseat
game ends, and immediately whenever you press Flag.

  npm run replay:review                  list the queue
  npm run replay:review -- <file name>   inspect a game's flagged moments and see what the bots would do now
  npm run replays:push                   commit and push everything in this folder
