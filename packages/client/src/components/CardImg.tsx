import { useState } from 'react'
import { findCard, printingImageUrl } from '@sorcery/shared'
import { useMobileMode } from '../mobile'
import { useArt } from '../art'

/** local cached copy (downloaded + compressed at build time by scripts/fetch_images.py) */
function localUrl(cdnUrl: string): string {
  const slug = cdnUrl.split('/').pop()!.replace(/\.png$/, '.webp')
  return `/cards/${slug}`
}

/**
 * Card rendering: local WebP cache first, CDN as fallback, text as last resort
 * (tokens have no image at all). If the card has a chosen alternative art (an explicit `art` slug or one
 * from the ArtContext), that printing is tried first, then the default art, then text — so a missing
 * alt-art image degrades to the normal card rather than to blank.
 */
export default function CardImg({ name, className, flipped, art }: { name: string; className?: string; flipped?: boolean; art?: string }) {
  const def = findCard(name)
  const ctx = useArt()
  const [stage, setStage] = useState(0)
  // A card flipped to a face it doesn't have (Vivien borrowing the Druid's flip)
  // shows the generic Sorcery card back — that side carries no rules of its own.
  if (flipped && !def?.flipImg && !def?.flipText) {
    return <CardBack kind={backKindFor(name)} className={className} />
  }
  // double-faced cards (the Druid) render their back art once flipped
  const faceImg = flipped && def?.flipImg ? def.flipImg : def?.img
  const faceText = flipped && def?.flipText ? def.flipText : def?.text
  // alternative art applies to the FRONT face only (double-faced backs have no alternate printings)
  const chosen = !flipped ? (art ?? ctx.artFor(name)) : undefined
  // candidate image URLs, tried in order: chosen-art local → chosen-art CDN → default local → default CDN
  const candidates: string[] = []
  if (chosen) candidates.push(`/cards/${chosen}.webp`, printingImageUrl(chosen))
  if (faceImg) candidates.push(localUrl(faceImg), faceImg)
  if (candidates.length && stage < candidates.length) {
    return (
      <img
        className={`cardimg ${className ?? ''}`}
        src={candidates[stage]}
        alt={name}
        loading="lazy"
        onError={() => setStage(stage + 1)}
      />
    )
  }
  return (
    <div className={`cardtext ${className ?? ''}`}>
      <div className="ct-name">{name}</div>
      {def && (
        <>
          <div className="ct-type">
            {def.type}
            {def.cost !== null ? ` · ${def.cost}` : ''}
            {def.attack !== null ? ` · ${def.attack}/${def.defence ?? def.attack}` : ''}
          </div>
          <div className="ct-text">{faceText}</div>
        </>
      )}
    </div>
  )
}

/**
 * The two real Sorcery card backs (art by Francesca Baerald), served locally
 * from public/backs. Spellbook cards (any non-site spell) show the portrait
 * spell back; Atlas cards (sites) show the landscape atlas back. `object-fit`
 * is left to CSS per call site so a landscape back never crops in a tall slot.
 */
export function CardBack({ kind, className }: { kind: 'spell' | 'site'; className?: string }) {
  const src = kind === 'site' ? '/backs/site.webp' : '/backs/spell.webp'
  const alt = kind === 'site' ? 'Atlas card back' : 'Spellbook card back'
  return <img className={`cardbackimg ${className ?? ''}`} src={src} alt={alt} loading="lazy" draggable={false} />
}

/** pick the correct back for a card by name (Site → atlas, otherwise → spellbook). */
export function backKindFor(name: string): 'spell' | 'site' {
  return findCard(name)?.type === 'Site' ? 'site' : 'spell'
}

export function CardHover({ name, flipped, art }: { name: string; flipped?: boolean; art?: string }) {
  const { mobile } = useMobileMode()
  const def = findCard(name)
  if (!def) return null
  // a flipped double-faced card shows its BACK face + text (Druid → Bruin aura side)
  const raw = flipped && def.flipText ? def.flipText : def.text
  // on the cramped mobile panel, collapse the blank lines between abilities (card text uses "\n\n")
  // so the whole effect fits without a wall of empty space
  const faceText = mobile ? raw.replace(/\n{2,}/g, '\n') : raw
  return (
    <div className="hovercard">
      <CardImg name={name} flipped={flipped} art={art} className="hoverimg" />
      <div className="hoverinfo">
        <b>{name}</b>
        {/* all the stats on ONE line so the effect text is what fills the panel */}
        <div className="hovermeta">
          {[
            def.type,
            def.rarity || null,
            def.cost !== null ? `cost ${def.cost}` : null,
            def.attack !== null ? `power ${def.attack}${def.defence !== null && def.defence !== def.attack ? `/${def.defence}` : ''}` : null,
            def.life !== null ? `life ${def.life}` : null,
          ].filter(Boolean).join(' · ')}
        </div>
        <div className="hovertext">{faceText || <i>(no text)</i>}</div>
      </div>
    </div>
  )
}
