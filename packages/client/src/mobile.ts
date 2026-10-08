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

/** an iPad (any model / iPadOS version).
 *
 *  Older iPadOS and 3rd-party browsers still put "iPad" in the UA. iPadOS 13+ Safari, however,
 *  defaults to a DESKTOP user agent that says "Macintosh" — indistinguishable from a real Mac by
 *  UA alone. The reliable tell there: a genuine Mac reports `maxTouchPoints === 0`, while an iPad
 *  masquerading as one reports multi-touch (>1). Either signal means iPad. */
export function isIPad(): boolean {
  try {
    const ua = navigator.userAgent
    if (/iPad/i.test(ua)) return true
    // iPadOS 13+ Safari → "Macintosh" UA + multi-touch. An iPhone with "Request Desktop Website"
    // on ALSO reports Macintosh + touch, so disambiguate by physical screen size: an iPad's longer
    // edge is ≥ 1024 CSS px, while the largest iPhone (16 Pro Max) is 956. `screen.*` is the device
    // screen (unaffected by the desktop-viewport inflation that skews `innerWidth`).
    if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) {
      return Math.max(screen?.width ?? 0, screen?.height ?? 0) >= 1000
    }
    return false
  } catch {
    return false
  }
}

/** any device with a touch screen (used to decide whether a portrait "rotate" hint makes sense). */
export function isTouchDevice(): boolean {
  try {
    return (navigator.maxTouchPoints ?? 0) > 0 || (window.matchMedia?.('(any-pointer: coarse)').matches ?? false)
  } catch {
    return false
  }
}

/** a genuine touch PHONE — NEVER a desktop/laptop (even a touchscreen one) and NEVER an iPad.
 *
 *  iPads are explicitly excluded: they're big enough for the full desktop ("PC") layout, which is
 *  a landscape canvas, so we serve that and let the user rotate the iPad to landscape (see the
 *  rotate hint). For everything else:
 *  The old heuristic ("coarse pointer on a small screen") wrongly flipped PCs into the
 *  mobile layout: a 1366×768 touchscreen laptop has min-dimension 768 (≤ 820) AND reports a
 *  coarse pointer, and any desktop browser shrunk below 820px in one dimension also matched.
 *  The reliable discriminator: a real phone has NO mouse/trackpad, so it exposes NO
 *  FINE pointer, whereas every laptop (touchscreen or not) does (its trackpad). So:
 *    - a mobile user-agent is a phone outright, and
 *    - otherwise only a touch-ONLY device (no fine pointer at all) on a small screen counts.
 *  This keeps real phones on mobile while guaranteeing a PC (and now an iPad) never auto-enters
 *  it. (Desktop preview is still available via /mobile or ?mobile.)
 */
export function isRealMobileDevice(): boolean {
  try {
    if (isIPad()) return false // iPads → the desktop (PC) layout, used in landscape
    const ua = /Android|iPhone|iPod|Mobile|Silk|Kindle|Opera Mini|BlackBerry|Windows Phone/i.test(navigator.userAgent)
    if (ua) return true
    const hasFinePointer = window.matchMedia?.('(any-pointer: fine)').matches ?? false
    const hasCoarsePointer = window.matchMedia?.('(any-pointer: coarse)').matches ?? false
    const small = Math.min(window.innerWidth, window.innerHeight) <= 820
    // touch-only (no mouse/trackpad) AND small → a genuine phone without a mobile UA
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
  /** viewport is taller than wide (a real phone / tablet held upright) */
  portrait: boolean
  /** the device has a touch screen (e.g. an iPad on the desktop layout) */
  touch: boolean
}

function compute(): MobileMode {
  const real = isRealMobileDevice()
  const forced = mobileForced()
  const portrait = (window.innerHeight ?? 0) > (window.innerWidth ?? 0)
  return { mobile: real || forced, simulated: forced && !real, portrait, touch: isTouchDevice() }
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
