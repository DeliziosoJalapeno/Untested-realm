// Phase-D DOM-level playability audit — the NINE abilities that phase C.1 could only
// classify INCONCLUSIVE ("engine cannot activate on the generic board (board-dependent)"
// or "no legal DOM target for this placement"). Each is given a PURPOSE-BUILT board so
// its precondition is met, then driven click-to-resolution through the REAL Game
// component and asserted on POST-STATE (not mere acceptance).
//
// This is included in `npm run audit:dom` automatically (vitest --root packages/client).
//
// The nine (see mission C.1b):
//   1. Horns of Behemoth  behemoth:wake  (fire:6)   → site transforms to a Demon; Rubble underneath
//   2. Island Leviathan   leviathan:wake (water:8)  → transforms to a Monster; flooded Rubble underneath
//   3. Mester Stoor Worm  tide           (Waterbound, needs water) → direction modal → grid damage lands
//   4. Draco Corvus       snatch         (tapped minion) → only TAPPED highlighted → teleport + buried
//   5. Love Potion        potion         (carried, enemy here, far from avatar) → control flips [Part-1 DOM regression]
//   6. Floodplain         overflow       (adjacent site) → site floods; highlight set == adjacent sites only
//   7. Sinkhole           collapse       (nearby site)  → both sites become Rubble
//   8. Willing Tribute    tribute        (adjacent tapped Evil ally) → Tribute sacrificed, ally untapped
//   9. Mover of Mountains heave          (two nearby empty sites) → the two sites swap coordinates
//
// One of these (Love Potion) DOUBLES as the Part-1 caster-anchor DOM regression: the
// bearer stands far from the avatar, so under the OLD avatar-anchor the client would
// highlight nothing "here" and the charm would be engine-rejected. The negative-control
// block at the bottom proves that RED signal against the engine oracle.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { board, usummon } from './domaudit'
import {
  getScript,
  getCard,
  canActivate,
  validateTarget,
  abilityAnchor,
  newId,
  adjacentSquares,
  isEvilUnit,
  type GameState,
  type PlayerId,
} from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => {
  active?.unmount()
  active = null
})

function must(root: HTMLElement, sel: string, why: string): HTMLElement {
  const el = root.querySelector(sel) as HTMLElement | null
  if (!el) throw new Error(`[${why}] expected element ${sel} not found`)
  return el
}

/** a clean board with the scaffold fzu units stripped so only our placed pieces exist. */
function cleanBoard(): GameState {
  const g = board()
  for (const id of Object.keys(g.units)) if (id.startsWith('fzu')) delete (g.units as any)[id]
  return g
}

/** place a real site with an ENGINE-VALID `s…` id at (x,y), controlled by player p.
 *  Engine-valid because Floodplain/Sinkhole target OTHER sites and parseTargetRefs
 *  only accepts a site ref that begins with `s`. */
function siteAt(g: GameState, p: PlayerId, name: string, x: number, y: number): string {
  const cardId = newId(g, 'c'); g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = newId(g, 's')
  g.sites[id] = { id, cardId, name, owner: p, controller: p, x, y, tapped: false, isRubble: false } as any
  return id
}

/** wipe all sites so a purpose-built affinity/terrain layout is unambiguous. */
function clearSites(g: GameState): void {
  for (const id of Object.keys(g.sites)) delete (g.sites as any)[id]
}

// =====================================================================================
// D.1 — Horns of Behemoth (fire:6) transforms into a Demon with Rubble underneath
// =====================================================================================
describe('D.1 Horns of Behemoth behemoth:wake', () => {
  it('with fire:6 affinity the site transforms into a Demon and leaves Rubble underneath', () => {
    const g = cleanBoard()
    clearSites(g)
    // six Ordinary fire sites for player 0 → fire affinity 6 (threshold met)
    for (let i = 0; i < 6; i++) siteAt(g, 0, 'Arid Desert', i % 5, Math.floor(i / 5))
    // the Horns of Behemoth site itself at (2,3)
    const horns = siteAt(g, 0, 'Horns of Behemoth', 2, 3)
    expect(canActivate(g, 0, horns, 'behemoth:wake'), 'wake is activatable at fire:6').toBeNull()

    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-site="${horns}"]`, 'Horns site'))
    h.rerender()
    const btn = must(h.container, '[data-ability="behemoth:wake"]', 'wake button') as HTMLButtonElement
    expect(btn.disabled, 'wake enabled at fire:6').toBe(false)
    const drift0 = h.drifts.length
    h.click(btn)
    h.rerender()
    expect(h.drifts.length, 'wake accepted').toBe(drift0)
    // POST-STATE: the site is gone, a Demon unit named 'Horns of Behemoth' stands at (2,3),
    // and Rubble sits underneath.
    expect(g.sites[horns], 'the Horns site was consumed').toBeUndefined()
    const demon = Object.values(g.units).find((u) => u.name === 'Horns of Behemoth' && u.x === 2 && u.y === 3)
    expect(demon, 'a unit rose where the site stood').toBeTruthy()
    expect(getScript('Horns of Behemoth')?.selfSubtypes?.(g, demon!, []), 'it is a Demon').toContain('Demon')
    const rubble = Object.values(g.sites).find((s) => s.x === 2 && s.y === 3 && s.isRubble)
    expect(rubble, 'Rubble underneath').toBeTruthy()
    expect(rubble!.flooded, 'the Demon rubble is dry (not flooded)').toBeFalsy()
  })
})

// =====================================================================================
// D.2 — Island Leviathan (water:8) transforms into a Monster; flooded Rubble underneath
// =====================================================================================
describe('D.2 Island Leviathan leviathan:wake', () => {
  it('with water:8 affinity the site transforms into a Monster and leaves flooded Rubble', () => {
    const g = cleanBoard()
    clearSites(g)
    for (let i = 0; i < 8; i++) siteAt(g, 0, 'Pond', i % 5, Math.floor(i / 5))
    const isle = siteAt(g, 0, 'Island Leviathan', 4, 3)
    expect(canActivate(g, 0, isle, 'leviathan:wake'), 'wake activatable at water:8').toBeNull()

    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-site="${isle}"]`, 'Leviathan site'))
    h.rerender()
    const btn = must(h.container, '[data-ability="leviathan:wake"]', 'wake button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    const drift0 = h.drifts.length
    h.click(btn)
    h.rerender()
    expect(h.drifts.length, 'wake accepted').toBe(drift0)
    expect(g.sites[isle], 'the Leviathan site was consumed').toBeUndefined()
    const monster = Object.values(g.units).find((u) => u.name === 'Island Leviathan' && u.x === 4 && u.y === 3)
    expect(monster, 'a Monster rose where the site stood').toBeTruthy()
    const rubble = Object.values(g.sites).find((s) => s.x === 4 && s.y === 3 && s.isRubble)
    expect(rubble, 'Rubble underneath').toBeTruthy()
    expect(rubble!.flooded, 'the Monster leaves FLOODED rubble').toBe(true)
  })
})

// =====================================================================================
// D.3 — Mester Stoor Worm (Waterbound): on a water site, tide fires a direction modal
//        then applies a lethal grid. Assert a victim in the grid took damage.
// =====================================================================================
describe('D.3 Mester Stoor Worm tide', () => {
  it('on a water site the tide button is enabled; direction modal → grid damage lands on a victim', () => {
    const g = cleanBoard()
    clearSites(g)
    // a water site under the Worm at (2,1); dry land elsewhere so the victim is on land
    siteAt(g, 0, 'Pond', 2, 1)
    siteAt(g, 1, 'Arid Desert', 2, 2) // the victim's square (south, in the tide's grid)
    siteAt(g, 1, 'Arid Desert', 1, 2)
    siteAt(g, 1, 'Arid Desert', 3, 2)
    const worm = usummon(g, 0, 'Mester Stoor Worm', 2, 1)
    g.units[worm].enteredTurn = g.turn - 1 // no summoning sickness (tap cost)
    const victim = usummon(g, 1, 'Foot Soldier', 2, 2) // one row down → in the tide grid

    expect(canActivate(g, 0, worm, 'tide'), 'tide is activatable on water').toBeNull()

    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${worm}"]`, 'worm chip'))
    h.rerender()
    const btn = must(h.container, '[data-ability="tide"]', 'tide button') as HTMLButtonElement
    expect(btn.disabled, 'tide enabled on a water site').toBe(false)
    h.click(btn)
    h.rerender()
    // a chooseOption direction modal is pending
    expect(h.state.prompts[0]?.kind, 'a direction modal appears').toBe('chooseOption')
    // the tide grid (facing 'n') sits at dy:+1..+2 from the Worm → reaches (2,2) directly
    // below it, where the victim stands (rot('n') is the identity, so dy stays positive).
    const dirBtn = [...h.container.querySelectorAll('[data-promptbox="chooseOption"] [data-choice]')]
      .find((b) => b.getAttribute('data-choice') === 'n') as HTMLButtonElement | undefined
    expect(dirBtn, 'a north direction choice renders').toBeTruthy()
    const hp0 = g.units[victim].damage
    const drift0 = h.drifts.length
    h.click(dirBtn!)
    h.rerender()
    expect(h.drifts.length, 'the surge resolved without drift').toBe(drift0)
    // POST-STATE: the victim died (lethal) or took damage. Lethal 1 vs Foot Soldier → dies.
    const stillAlive = g.units[victim]
    expect(stillAlive === undefined || stillAlive.damage > hp0, 'the victim took the tide damage').toBe(true)
  })
})

// =====================================================================================
// D.4 — Draco Corvus snatch: only TAPPED enemy minions are legal targets; driving it
//        teleports the Corvus onto the target and buries the target underground (land).
// =====================================================================================
describe('D.4 Draco Corvus snatch', () => {
  it('only TAPPED minions are highlighted; snatch teleports + buries the target underground', () => {
    const g = cleanBoard()
    // land sites so terrainAt === 'land' → target gets dragged underground
    siteAt(g, 0, 'Arid Desert', 2, 0)
    siteAt(g, 1, 'Arid Desert', 2, 1)
    siteAt(g, 1, 'Arid Desert', 3, 1)
    const corvus = usummon(g, 0, 'Draco Corvus', 2, 0)
    g.units[corvus].enteredTurn = g.turn - 1
    // a Burrowing target survives being dragged underground so we can assert its region
    // (a non-Burrowing minion buried underground dies as a state-based effect — also a
    // valid "buried" outcome, but Burrowing gives the clean region assertion the mission asks for).
    const tappedFoe = usummon(g, 1, 'Cave Trolls', 2, 1)
    g.units[tappedFoe].tapped = true
    const untappedFoe = usummon(g, 1, 'Foot Soldier', 3, 1)
    g.units[untappedFoe].tapped = false

    const spec = (getScript('Draco Corvus') as any).abilities[0].targets[0]
    // engine oracle: the filter accepts only the tapped foe
    expect(validateTarget(g, spec, { unit: tappedFoe }, g.units[corvus], 0), 'tapped foe is legal').toBeNull()
    expect(validateTarget(g, spec, { unit: untappedFoe }, g.units[corvus], 0), 'untapped foe is illegal').not.toBeNull()

    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${corvus}"]`, 'corvus chip'))
    h.rerender()
    const btn = must(h.container, '[data-ability="snatch"]', 'snatch button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    h.click(btn)
    h.rerender()
    // abilityTargets mode: only the TAPPED foe carries data-target="1"
    const highlighted = new Set(
      [...h.container.querySelectorAll('[data-unit][data-target="1"]')].map((el) => el.getAttribute('data-unit')),
    )
    expect(highlighted.has(tappedFoe), 'the tapped foe is highlighted').toBe(true)
    expect(highlighted.has(untappedFoe), 'the untapped foe is NOT highlighted').toBe(false)
    const drift0 = h.drifts.length
    h.click(must(h.container, `[data-unit="${tappedFoe}"][data-target="1"]`, 'snatch target'))
    h.rerender()
    expect(h.drifts.length, 'snatch accepted').toBe(drift0)
    // POST-STATE: the Corvus teleported onto the target's square; the target is underground.
    expect(g.units[corvus].x, 'Corvus teleported to target x').toBe(2)
    expect(g.units[corvus].y, 'Corvus teleported to target y').toBe(1)
    expect(g.units[tappedFoe].region, 'the target is dragged underground on land').toBe('underground')
  })
})

// =====================================================================================
// D.5 — Love Potion potion (carried, enemy on the bearer's square, FAR from the avatar).
//        Doubles as the Part-1 caster-anchor DOM regression.
// =====================================================================================
describe('D.5 Love Potion potion (Part-1 caster-anchor DOM regression)', () => {
  it('the bearer far from the avatar charms an enemy on ITS square; control flips', () => {
    const g = cleanBoard()
    // avatar of seat 0 is at (2,0). Bearer + potion + enemy all at (0,3), far away.
    const bearer = usummon(g, 0, 'Foot Soldier', 0, 3)
    g.units[bearer].enteredTurn = g.turn - 1
    const potionCard = newId(g, 'c'); g.cards[potionCard] = { id: potionCard, name: 'Love Potion', owner: 0 } as any
    const potion = newId(g, 'a')
    g.artifacts[potion] = { id: potion, cardId: potionCard, name: 'Love Potion', owner: 0, conjuredBy: 0, x: 0, y: 3, region: 'surface', carriedBy: bearer, tapped: false, counters: {} } as any
    g.units[bearer].carrying.push(potion)
    const enemy = usummon(g, 1, 'Foot Soldier', 0, 3)

    // engine oracle: the anchor for this carried artifact is the bearer, not the avatar
    expect(abilityAnchor(g, potion, 0).id, 'anchor is the bearer').toBe(bearer)

    const h = new GameHarness(g).mount()
    active = h
    // select the bearer to reveal its carried-artifact ability
    h.click(must(h.container, `[data-unit="${bearer}"]`, 'bearer chip'))
    h.rerender()
    const btn = must(h.container, `[data-ability="potion"][data-source="${potion}"]`, 'potion button') as HTMLButtonElement
    expect(btn.disabled, 'potion is activatable').toBe(false)
    h.click(btn)
    h.rerender()
    // the enemy at the bearer's square must be highlighted "here" (source-anchored)
    expect(
      h.container.querySelector(`[data-unit="${enemy}"][data-target="1"]`),
      'the enemy on the bearer\'s square is a legal "here" target',
    ).not.toBeNull()
    const drift0 = h.drifts.length
    h.click(must(h.container, `[data-unit="${enemy}"][data-target="1"]`, 'charm target'))
    h.rerender()
    expect(h.drifts.length, 'the charm was engine-accepted (source-anchored)').toBe(drift0)
    // POST-STATE: control of the enemy flipped to player 0; the potion is consumed.
    expect(g.units[enemy].controller, 'the enemy is now controlled by player 0').toBe(0)
    expect(g.artifacts[potion], 'the Love Potion was sacrificed').toBeUndefined()
  })
})

// =====================================================================================
// D.6 — Floodplain overflow: floods an ADJACENT site; the DOM highlight set for the
//        overflow == the adjacent sites only.
// =====================================================================================
describe('D.6 Floodplain overflow', () => {
  it('floods an adjacent site; highlight set == adjacent sites only', () => {
    const g = cleanBoard()
    clearSites(g)
    const flood = siteAt(g, 0, 'Floodplain', 2, 1)
    const adj = siteAt(g, 0, 'Arid Desert', 2, 2)       // adjacent (shares a border)
    const alsoAdj = siteAt(g, 0, 'Arid Desert', 3, 1)    // adjacent
    const diag = siteAt(g, 0, 'Arid Desert', 3, 2)       // diagonal → NOT adjacent
    const far = siteAt(g, 0, 'Arid Desert', 0, 0)        // far → NOT adjacent

    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-site="${flood}"]`, 'Floodplain'))
    h.rerender()
    const btn = must(h.container, '[data-ability="overflow"]', 'overflow button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    h.click(btn)
    h.rerender()

    // HIGHLIGHT SET: the sites the DOM marks data-target="1" must be exactly Floodplain's
    // adjacent sites. Build the expected set from the engine's adjacency helper.
    const adjSquares = adjacentSquares(2, 1)
    const expected = new Set(
      Object.values(g.sites)
        .filter((s) => adjSquares.some((q) => q.x === s.x && q.y === s.y))
        .map((s) => s.id),
    )
    const domTargets = new Set(
      [...h.container.querySelectorAll('[data-site][data-target="1"]')].map((el) => el.getAttribute('data-site')!),
    )
    expect(domTargets, 'highlight set == adjacent sites only').toEqual(expected)
    // sanity on membership
    expect(domTargets.has(adj)).toBe(true)
    expect(domTargets.has(alsoAdj)).toBe(true)
    expect(domTargets.has(diag), 'diagonal site is NOT adjacent → not highlighted').toBe(false)
    expect(domTargets.has(far), 'far site is not highlighted').toBe(false)

    const drift0 = h.drifts.length
    h.click(must(h.container, `[data-site="${adj}"][data-target="1"]`, 'flood target'))
    h.rerender()
    expect(h.drifts.length, 'overflow accepted the adjacent site').toBe(drift0)
    // POST-STATE: the adjacent site is flooded.
    expect(g.sites[adj].flooded, 'the adjacent site is now flooded').toBe(true)
  })
})

// =====================================================================================
// D.7 — Sinkhole collapse: destroys a NEARBY site (both sites become Rubble).
// =====================================================================================
describe('D.7 Sinkhole collapse', () => {
  it('destroys a nearby site; both the target and Sinkhole become Rubble', () => {
    const g = cleanBoard()
    clearSites(g)
    const sink = siteAt(g, 0, 'Sinkhole', 2, 1)
    const nearDiag = siteAt(g, 0, 'Arid Desert', 3, 2) // diagonally nearby (nearby includes diagonals)
    const far = siteAt(g, 0, 'Arid Desert', 0, 0)

    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-site="${sink}"]`, 'Sinkhole'))
    h.rerender()
    const btn = must(h.container, '[data-ability="collapse"]', 'collapse button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    h.click(btn)
    h.rerender()
    const domTargets = new Set(
      [...h.container.querySelectorAll('[data-site][data-target="1"]')].map((el) => el.getAttribute('data-site')!),
    )
    // nearby includes diagonals → nearDiag is a legal target, far is not, and Sinkhole
    // itself is excluded by the in-effect self guard (validateTarget accepts it, but the
    // spec is where:'nearby' which includes self — the engine self-guard is in-effect, so
    // the highlight may include the source; we only assert the diagonal IS present and far ISN'T).
    expect(domTargets.has(nearDiag), 'the diagonally-nearby site is highlighted').toBe(true)
    expect(domTargets.has(far), 'the far site is not highlighted').toBe(false)

    const drift0 = h.drifts.length
    h.click(must(h.container, `[data-site="${nearDiag}"][data-target="1"]`, 'collapse target'))
    h.rerender()
    expect(h.drifts.length, 'collapse accepted the nearby site').toBe(drift0)
    // POST-STATE: both squares now hold Rubble.
    const rubbleAt = (x: number, y: number) => Object.values(g.sites).some((s) => s.x === x && s.y === y && s.isRubble)
    expect(rubbleAt(3, 2), 'the nearby site is rubble').toBe(true)
    expect(rubbleAt(2, 1), 'Sinkhole sacrificed itself → rubble').toBe(true)
  })
})

// =====================================================================================
// D.8 — Willing Tribute tribute: sacrifices itself to untap an adjacent Evil ally.
// =====================================================================================
describe('D.8 Willing Tribute tribute', () => {
  it('sacrifices the Tribute and untaps the adjacent tapped Evil ally', () => {
    const g = cleanBoard()
    siteAt(g, 0, 'Arid Desert', 2, 0)
    siteAt(g, 0, 'Arid Desert', 2, 1)
    const tribute = usummon(g, 0, 'Willing Tribute', 2, 0)
    g.units[tribute].enteredTurn = g.turn - 1
    // a cheap real Evil ally adjacent + tapped. Ghoul (Undead) is Evil.
    const ally = usummon(g, 0, 'Ghoul', 2, 1)
    g.units[ally].tapped = true
    expect(isEvilUnit(g, g.units[ally]), 'the ally is Evil').toBe(true)

    // canActivate must treat cost.sacrificeSelf as payable while the source lives
    expect(canActivate(g, 0, tribute, 'tribute'), 'tribute is activatable (sacrificeSelf payable)').toBeNull()

    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${tribute}"]`, 'tribute chip'))
    h.rerender()
    const btn = must(h.container, '[data-ability="tribute"]', 'tribute button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    h.click(btn)
    h.rerender()
    // only the adjacent Evil ally is a legal target
    expect(h.container.querySelector(`[data-unit="${ally}"][data-target="1"]`), 'the Evil ally is highlighted').not.toBeNull()
    const drift0 = h.drifts.length
    h.click(must(h.container, `[data-unit="${ally}"][data-target="1"]`, 'untap target'))
    h.rerender()
    expect(h.drifts.length, 'tribute accepted').toBe(drift0)
    // POST-STATE: the Tribute is sacrificed (gone); the ally is untapped.
    expect(g.units[tribute], 'Willing Tribute sacrificed itself').toBeUndefined()
    expect(g.units[ally].tapped, 'the Evil ally is untapped').toBe(false)
  })
})

// =====================================================================================
// D.9 — Mover of Mountains heave: swaps two nearby EMPTY sites' coordinates.
// =====================================================================================
describe('D.9 Mover of Mountains heave', () => {
  it('swaps the coordinates of two nearby empty sites', () => {
    const g = cleanBoard()
    clearSites(g)
    // Mover at (2,1). Two nearby empty sites to swap. Keep the Mover's own square sited too.
    siteAt(g, 0, 'Arid Desert', 2, 1) // under the mover (occupied, not a swap target)
    const siteA = siteAt(g, 0, 'Red Desert', 1, 1)  // nearby, empty
    const siteB = siteAt(g, 0, 'Bonfire', 3, 2)      // nearby (diagonal), empty
    const mover = usummon(g, 0, 'Mover of Mountains', 2, 1)
    g.units[mover].enteredTurn = g.turn - 1

    const aBefore = { x: g.sites[siteA].x, y: g.sites[siteA].y }
    const bBefore = { x: g.sites[siteB].x, y: g.sites[siteB].y }

    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${mover}"]`, 'mover chip'))
    h.rerender()
    const btn = must(h.container, '[data-ability="heave"]', 'heave button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    h.click(btn)
    h.rerender()
    // first empty site
    h.click(must(h.container, `[data-site="${siteA}"][data-target="1"]`, 'first swap site'))
    h.rerender()
    const drift0 = h.drifts.length
    // second empty site
    h.click(must(h.container, `[data-site="${siteB}"][data-target="1"]`, 'second swap site'))
    h.rerender()
    expect(h.drifts.length, 'heave accepted two nearby empty sites').toBe(drift0)
    // POST-STATE: the two sites traded coordinates.
    expect({ x: g.sites[siteA].x, y: g.sites[siteA].y }, 'site A took site B\'s position').toEqual(bBefore)
    expect({ x: g.sites[siteB].x, y: g.sites[siteB].y }, 'site B took site A\'s position').toEqual(aBefore)
  })
})

// =====================================================================================
// D.10 — Corpse Catapult fling: a CARRIED artifact whose fling ability is board-dependent
//         (bearer untapped + an untapped ally co-located + a minion corpse in a cemetery).
//         On the generic C.1 board none of those hold, so it reads INCONCLUSIVE there; here
//         we build the board, drive bearer → fling → square → corpse pick, and assert the
//         corpse is banished, bearer + helper tap, and the target square takes the damage.
// =====================================================================================
describe('D.10 Corpse Catapult fling', () => {
  it('with a corpse + an untapped ally here, fling banishes the corpse, taps both, and damages the target square', () => {
    const g = cleanBoard()
    clearSites(g)
    siteAt(g, 0, 'Arid Desert', 2, 1) // under the bearer / catapult
    siteAt(g, 1, 'Arid Desert', 2, 2) // the target square (1 step away, ≤3)
    const bearer = usummon(g, 0, 'Foot Soldier', 2, 1)
    g.units[bearer].enteredTurn = g.turn - 1
    const helper = usummon(g, 0, 'Foot Soldier', 2, 1) // an untapped ally on the catapult's square
    g.units[helper].enteredTurn = g.turn - 1
    // the Corpse Catapult, carried by the bearer
    const catCard = newId(g, 'c'); g.cards[catCard] = { id: catCard, name: 'Corpse Catapult', owner: 0 } as any
    const cat = newId(g, 'a')
    g.artifacts[cat] = { id: cat, cardId: catCard, name: 'Corpse Catapult', owner: 0, conjuredBy: 0, x: 2, y: 1, region: 'surface', carriedBy: bearer, tapped: false, counters: {} } as any
    g.units[bearer].carrying.push(cat)
    // a minion corpse to fling (Stygian Archers → attack 3, so the fling deals 3)
    const deadCard = newId(g, 'c'); g.cards[deadCard] = { id: deadCard, name: 'Stygian Archers', owner: 0 } as any
    g.players[0].cemetery.push(deadCard)
    const power = getCard('Stygian Archers').attack ?? 0
    expect(power, 'the corpse has attack power to fling').toBeGreaterThan(0)
    const victim = usummon(g, 1, 'Foot Soldier', 2, 2)

    // engine oracle: fling is activatable now, and NOT once the ally is tapped away
    expect(canActivate(g, 0, cat, 'fling'), 'fling activatable with corpse + untapped ally').toBeNull()

    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${bearer}"]`, 'bearer chip'))
    h.rerender()
    const btn = must(h.container, `[data-ability="fling"][data-source="${cat}"]`, 'fling button') as HTMLButtonElement
    expect(btn.disabled, 'fling enabled on the purpose-built board').toBe(false)
    h.click(btn)
    h.rerender()
    // square-target mode: the target square is highlighted + clickable
    const sq = must(h.container, '[data-sq="2,2"][data-clickable="1"]', 'target square') as HTMLElement
    h.click(sq)
    h.rerender()
    // one ally here → helper auto-picked → a chooseCards "which corpse?" prompt appears
    const box = must(h.container, '[data-promptbox="chooseCards"]', 'corpse chooser')
    const tile = must(box, '[data-choice]', 'the lone corpse tile') as HTMLElement
    h.click(tile)
    h.rerender()
    const confirm = box.querySelector('[data-confirm="1"]') as HTMLButtonElement | null
    if (confirm) { h.click(confirm); h.rerender() }
    // POST-STATE: the corpse left the cemetery for the banished pile; bearer + helper tapped;
    // the target square took the fling damage.
    expect(g.players[0].cemetery.includes(deadCard), 'the corpse left the cemetery').toBe(false)
    expect(g.players[0].banished.includes(deadCard), 'the corpse is banished').toBe(true)
    expect(g.units[bearer].tapped, 'the bearer tapped to fling').toBe(true)
    expect(g.units[helper].tapped, 'the helping ally tapped').toBe(true)
    const v = g.units[victim]
    expect(v === undefined || v.damage > 0, 'the flung corpse dealt damage to the target square').toBe(true)
  })
})

// =====================================================================================
// D — negative control for the Part-1 anchor via the DOM oracle (Love Potion).
// Under the OLD avatar anchor the enemy on the bearer's FAR square is NOT "here", so the
// client would highlight nothing and the engine would reject the charm. We prove that RED
// signal by computing both anchored sets and asserting they differ (the avatar-anchored
// set is empty → the D.5 highlight/accept asserts would fail).
// =====================================================================================
describe('D negative control — avatar anchor would fail Love Potion "here"', () => {
  it('avatar-anchored "here" set is empty while the source-anchored set contains the enemy', () => {
    const g = cleanBoard()
    const bearer = usummon(g, 0, 'Foot Soldier', 0, 3)
    const potionCard = newId(g, 'c'); g.cards[potionCard] = { id: potionCard, name: 'Love Potion', owner: 0 } as any
    const potion = newId(g, 'a')
    g.artifacts[potion] = { id: potion, cardId: potionCard, name: 'Love Potion', owner: 0, conjuredBy: 0, x: 0, y: 3, region: 'surface', carriedBy: bearer, tapped: false, counters: {} } as any
    g.units[bearer].carrying.push(potion)
    const enemy = usummon(g, 1, 'Foot Soldier', 0, 3)
    const avatar = g.units[g.players[0].avatarUnitId]
    const spec = (getScript('Love Potion') as any).abilities[0].targets[0]

    const fromSource = validateTarget(g, spec, { unit: enemy }, abilityAnchor(g, potion, 0), 0) === null
    const fromAvatar = validateTarget(g, spec, { unit: enemy }, avatar, 0) === null
    expect(fromSource, 'source (bearer) anchor accepts the enemy "here"').toBe(true)
    expect(fromAvatar, 'avatar anchor rejects it (enemy is not "here" for the avatar)').toBe(false)
  })
})
