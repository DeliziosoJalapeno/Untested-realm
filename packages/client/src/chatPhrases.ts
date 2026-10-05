// The complete set of canned chat phrases a player can send during an online game.
// This is the single source of truth — add (or reword) phrases here and the in-game
// chat picker renders the list verbatim, in order. Keep them short: each is shown as a
// bubble on the opponent's board for a few seconds.
export const CHAT_PHRASES = [
  'gg',
  'good luck!',
  'hurry up!',
  'please!',
  'whoa!',
  'that was a bug!',
  "that wasn't a bug!",
  'brace yourself for this!',
  ':(',
  'sorry',
] as const

export type ChatPhrase = (typeof CHAT_PHRASES)[number]

/** How long a chat bubble lingers on the board (ms). */
export const CHAT_BUBBLE_MS = 5000
