// jsdom polyfills for browser APIs that Game.tsx (and React 18) touch but jsdom
// does not implement. Images never load in jsdom — that's fine, the harness
// drives clicks, not pixels.
import '@testing-library/jest-dom/vitest'

// Element.scrollIntoView (jsdom stub) — some UI code scrolls the log/board.
if (!('scrollIntoView' in Element.prototype)) {
  ;(Element.prototype as any).scrollIntoView = () => {}
} else {
  ;(Element.prototype as any).scrollIntoView = () => {}
}

// ResizeObserver — not in jsdom; Game.tsx uses a window resize listener rather
// than RO directly, but React/portal libs sometimes probe for it.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  ;(globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// matchMedia — not in jsdom.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as any
}

// crypto.randomUUID — used by App.newDeckId; jsdom's crypto may lack it.
if (typeof globalThis.crypto === 'undefined') {
  ;(globalThis as any).crypto = {}
}
if (typeof (globalThis.crypto as any).randomUUID !== 'function') {
  ;(globalThis.crypto as any).randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
}
