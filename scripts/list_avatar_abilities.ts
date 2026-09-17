// Triage: which Avatars have scripted activated abilities (and which script hooks
// avatars carry at all) — the DOM ability sweep and audit_playable phase 3 both
// filtered type !== 'Avatar', so none of these were driven.
import { allCards } from '../packages/shared/src/cards/db'
import { getScript } from '../packages/shared/src/cards/scripts/registry'
import '../packages/shared/src/cards/scripts/index'

for (const c of allCards.filter((c) => c.type === 'Avatar')) {
  const s = getScript(c.name) as any
  if (!s) { console.log(`${c.name}: (no script)`); continue }
  const abilities = (s.abilities ?? []).map((a: any) => `${a.key}${a.targets?.length ? ` [targets:${a.targets.map((t: any) => t.what).join('+')}]` : ''}${a.cost?.tap ? ' (tap)' : ''}${a.cost?.mana ? ` (${a.cost.mana} mana)` : ''}`)
  const hooks = Object.keys(s).filter((k) => k !== 'abilities')
  console.log(`${c.name}: abilities=[${abilities.join(', ')}] otherHooks=[${hooks.join(', ')}]`)
}
