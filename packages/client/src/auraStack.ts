// Layout for aura cards that would be drawn at the SAME spot on the board (two 2x2 auras on one
// intersection, two walls on one border, ...). Instead of stacking them so the last one hides the
// rest, the group shares the spot: each card shrinks and they sit side by side (wrapping into a
// second row past 4), so every aura stays visible, hoverable and clickable. A lone aura is unchanged.

export interface AuraStackSlot {
  scale: number
  dx: number
  dy: number
}

/** Where card `index` of a `count`-strong group sits, relative to where a lone card would be drawn.
 *  `cardW`/`cardH` are the unscaled card footprint (px). With `align: 'center'` the group is centred
 *  on the lone card's spot (scale about the card centre); with `'start'` it grows right/down from
 *  the lone card's top-left corner (scale about the top-left — use transform-origin: top left). */
export function auraStackLayout(index: number, count: number, cardW: number, cardH: number, align: 'center' | 'start' = 'center'): AuraStackSlot {
  if (count <= 1) return { scale: 1, dx: 0, dy: 0 }
  const cols = Math.min(count, 4)
  const rows = Math.ceil(count / cols)
  const scale = Math.min(0.8, 1.9 / cols, 1.1 / rows)
  const w = cardW * scale
  const h = cardH * scale
  const row = Math.floor(index / cols)
  const col = index % cols
  if (align === 'start') return { scale, dx: col * w, dy: row * h }
  // centre each row on its own length (a short last row stays centred) and the rows on the spot
  const inRow = Math.min(cols, count - row * cols)
  return { scale, dx: (col - (inRow - 1) / 2) * w, dy: (row - (rows - 1) / 2) * h }
}
