// Shared by a tuning candidate (tune_gen.ts) and the totalling step (tune_total.mjs): the random nudges
// of a generation, and the step from a generation's results to the next base.
const FROZEN = new Set(['win']) // never tuned

function gaussians(seed, n) {
  let s = seed >>> 0
  const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296 }
  const out = []
  for (let i = 0; i < n; i++) out.push(Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()))
  return out
}

/** the nudge (in standard deviations) of every weight for one candidate; the second half mirrors the first */
export function nudges(keys, seed, candidate, candidates) {
  const half = Math.floor(candidates / 2)
  const j = candidate % half, sign = candidate < half ? 1 : -1
  const g = gaussians((seed * 7919 + j * 104729 + 13) >>> 0, keys.length)
  const out = {}
  keys.forEach((k, i) => { out[k] = FROZEN.has(k) ? 0 : sign * g[i] })
  return out
}

/** base weights with every weight multiplied by e^(sigma x nudge); a weight of 0 stays 0 */
export function applyNudges(base, z, sigma) {
  const out = { ...base }
  for (const k of Object.keys(z)) if (typeof base[k] === 'number' && base[k] !== 0) out[k] = +(base[k] * Math.exp(sigma * z[k])).toPrecision(4)
  return out
}

/** The next base. `results` = [{ candidate, a, b }] (b = candidate wins). For each mirrored pair of
 *  candidates, the difference in their win shares says which direction of that pair's nudges is better;
 *  every weight moves by the average of those signals (an evolution-strategy step), capped per generation. */
export function nextBase(base, keys, results, seed, candidates, sigma, rate = 1) {
  const half = Math.floor(candidates / 2)
  const share = new Map()
  for (const r of results) { const n = r.a + r.b; if (n > 0) share.set(r.candidate, r.b / n) }
  const step = {}
  keys.forEach((k) => { step[k] = 0 })
  let used = 0
  for (let j = 0; j < half; j++) {
    if (!share.has(j) || !share.has(j + half)) continue
    const diff = share.get(j) - share.get(j + half)
    const z = nudges(keys, seed, j, candidates)
    keys.forEach((k) => { step[k] += diff * z[k] })
    used++
  }
  const out = { ...base }
  if (!used) return { weights: out, used, moved: {} }
  const moved = {}
  for (const k of keys) {
    if (typeof base[k] !== 'number' || base[k] === 0 || FROZEN.has(k)) continue
    const s = Math.max(-0.15, Math.min(0.15, rate * step[k] / used)) // at most about 15% per generation
    out[k] = +(base[k] * Math.exp(s)).toPrecision(4)
    if (Math.abs(s) >= 0.02) moved[k] = +(100 * (Math.exp(s) - 1)).toFixed(1)
  }
  return { weights: out, used, moved }
}
