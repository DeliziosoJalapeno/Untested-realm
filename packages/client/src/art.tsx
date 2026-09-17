import { createContext, useContext } from 'react'

/** Resolve a card's chosen alternative art (a printing slug) by card name. Provided per surface: the deck
 *  builder feeds the deck being edited; in-game each card instance carries its own baked art, so the
 *  provider is only a fallback for name-only renders (hover, text lists). Default = no override. */
export interface ArtCtx {
  artFor: (name: string) => string | undefined
}

const ArtContext = createContext<ArtCtx>({ artFor: () => undefined })
export const ArtProvider = ArtContext.Provider
export function useArt(): ArtCtx {
  return useContext(ArtContext)
}

/** build an ArtCtx from a deck's `art` map (card name → printing slug). */
export function artCtxFromMap(map?: Record<string, string>): ArtCtx {
  return { artFor: (name) => map?.[name] }
}
