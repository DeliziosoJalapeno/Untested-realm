// Mobile GUI mode — a landscape, "rotated" layout: the board sits in the centre,
// life & mana on the LEFT rail, the card-detail panel + log on the RIGHT, and the
// hand floats over the board as a show/hide overlay. It turns on automatically on a
// real phone/tablet, and can be FORCED on a desktop (via the /mobile path or a
// ?mobile query) which renders it inside a phone-shaped frame — a simulator so the
// mobile layout can be built and debugged from a PC.

import { useEffect, useState } from 'react'

/** the mobile layout was explicitly requested via the URL (desktop preview). */
export function mobileForced(): boolean {
  try {
    if (/^\/mobile(\/|$)/.test(location.pathname)) return true
    return new URLSearchParams(location.search).has('mobile')
  } catch {
    return false
  }
}

/** a genuine touch phone/tablet — NEVER a desktop/laptop, even a touchscreen one.
 *
 *  The old heuristic ("coarse pointer on a small screen") wrongly flipped PCs into the
 *  mobile layout: a 1366×768 touchscreen laptop has min-dimension 768 (≤ 820) AND reports a
 *  coarse pointer, and any desktop browser shrunk below 820px in one dimension also matched.
 *  The reliable discriminator: a real phone/tablet has NO mouse/trackpad, so it exposes NO
 *  FINE pointer, whereas every laptop (touchscreen or not) does (its trackpad). So:
 *    - a mobile user-agent is a phone/tablet outright, and
 *    - otherwise only a touch-ONLY device (no fine pointer at all) on a small screen counts.
 *  This keeps real phones and mouseless tablets (incl. iPads) on mobile while guaranteeing a
 *  PC never auto-enters it. (Desktop preview is still available via /mobile or ?mobile.)
 */
export function isRealMobileDevice(): boolean {
  try {
    const ua = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini|BlackBerry|Windows Phone/i.test(navigator.userAgent)
    if (ua) return true
    const hasFinePointer = window.matchMedia?.('(any-pointer: fine)').matches ?? false
    const hasCoarsePointer = window.matchMedia?.('(any-pointer: coarse)').matches ?? false
    const small = Math.min(window.innerWidth, window.innerHeight) <= 820
    // touch-only (no mouse/trackpad) AND small → a genuine tablet/phone without a mobile UA
    return hasCoarsePointer && !hasFinePointer && small
  } catch {
    return false
  }
}

export interface MobileMode {
  /** render the mobile layout at all */
  mobile: boolean
  /** desktop preview → wrap in a phone frame (real devices fill the viewport) */
  simulated: boolean
  /** viewport is taller than wide (a real phone held upright) */
  portrait: boolean
}

function compute(): MobileMode {
  const real = isRealMobileDevice()
  const forced = mobileForced()
  const portrait = (window.innerHeight ?? 0) > (window.innerWidth ?? 0)
  return { mobile: real || forced, simulated: forced && !real, portrait }
}

/** Live mobile-mode state, recomputed on resize / orientation change. */
export function useMobileMode(): MobileMode {
  const [m, setM] = useState<MobileMode>(compute)
  useEffect(() => {
    const on = () => setM(compute())
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
    }
  }, [])
  return m
}
