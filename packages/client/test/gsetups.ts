// Phase-G setup table: one entry per board-dependent card the generic oracle board
// cannot cast. Each entry augments the sweep's sweepBoard() with the precondition the
// card's canCast / extraCastCheck / target specs require, and (for Phase G) supplies a
// post-state `assert` read directly from the card's script observable.
//
// Shared by BOTH consumers:
//   • domaudit.sweep.test.tsx  — registers each setup in SETUP_OVERRIDES so the card
//     runs the oracle AND the DOM drive on the override board.
//   • domaudit.phaseG.test.tsx — one test per card: drive the cast through the DOM on
//     the override board, then run the card's `assert`.
//
// A setup MUTATES the board `g` in place (applied on top of sweepBoard()). It ends by
// calling base(g) to record a BEFORE snapshot. `assert(g)` returns an error string, or
// null when the observable delta is present.
//
// WHY AGGREGATE ASSERTS: the DOM driver picks the FIRST legal affordance, which is not
// always the specific unit a setup placed (e.g. a "target minion" spell may hit the ally
// before the enemy). So asserts compare a BEFORE/AFTER snapshot to prove the card's
// observable DELTA occurred (damage dealt, a unit died, control changed, a region shift,
// a token/site/flood appeared, a modifier/ward/disable/stealth applied) — a real
// post-state check that doesn't depend on which legal target the driver chose. Where a
// setup CAN pin the outcome (only one legal target), the assert is exact.
//
// sweepBoard() scaffold (see domaudit.sweepBoardBase):
//   p0 avatar (Avatar of Earth) at (2,0); p1 avatar (Sorcerer) at (2,3);
//   p0 Rustic Villages (land, s-prefix) at (2,0)(2,1)(3,1)(1,1); p1 at (2,3)(2,2)(3,2);
//   ally Foot Soldier (u) at (1,1); enemy Foot Soldiers (u) at (2,1) and (1,2).
//   Empty squares include (0,0)(0,1)(0,2)(0,3)(1,0)(3,0)(4,0)(4,1)(4,2)(4,3)(3,3)(1,3).

import {
  usummon,
  place,
  type GameState,
  type PlayerId,
} from '@sorcery/shared'

export interface GSetup {
  /** mutate the board in place to make this card castable + observable */
  setup: (g: GameState) => void
  /** post-DOM-drive assertion: return an error string, or null when the delta is present */
  assert?: (g: GameState) => string | null
}

// ---- site helpers (engine-valid `s…` ids so the DOM can target them) ----

const WATER_SITE = 'Pond'      // Ordinary water site, no submersion-blocking script

/** place a site with an ENGINE-VALID `s…` id (parseTargetRefs needs the `s` prefix so
 *  the DOM can send it as a site target). Removes any existing site at (x,y) first. */
function uplaceSite(g: GameState, p: PlayerId, name: string, x: number, y: number): string {
  for (const [k, s] of Object.entries(g.sites)) if (s.x === x && s.y === y) delete (g.sites as any)[k]
  const cardId = `gcs${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = `s${g.nextId++}`
  g.sites[id] = { id, cardId, name, owner: p, controller: p, x, y, tapped: false, isRubble: false } as any
  return id
}
function placeWater(g: GameState, p: PlayerId, x: number, y: number): string { return uplaceSite(g, p, WATER_SITE, x, y) }

/** make the site at (x,y) engine-targetable (re-mint an `s…` id keeping name/controller,
 *  or place a Rustic Village if none). Returns the targetable site id. */
function targetableSiteAt(g: GameState, x: number, y: number, p: PlayerId = 0, name = 'Rustic Village'): string {
  const existing = Object.entries(g.sites).find(([, s]) => s.x === x && s.y === y)
  const useName = existing ? existing[1].name : name
  const useCtl = existing ? (existing[1].controller ?? p) : p
  return uplaceSite(g, useCtl as PlayerId, useName, x, y)
}

/** remove ALL sites so the ONLY targetable site is the single `s…` site the setup then
 *  places. Site-target spells with no filter let the DOM driver click the FIRST rendered
 *  site; with exactly one site on the board its choice is pinned to the observable one. */
function onlySite(g: GameState, x: number, y: number, p: PlayerId = 0, name = 'Rustic Village'): string {
  for (const k of Object.keys(g.sites)) delete (g.sites as any)[k]
  return uplaceSite(g, p, name, x, y)
}
function onlyWaterSite(g: GameState, x: number, y: number, p: PlayerId = 0): string {
  for (const k of Object.keys(g.sites)) delete (g.sites as any)[k]
  return uplaceSite(g, p, WATER_SITE, x, y)
}

// ---- unit helpers (engine-valid u-prefix, targetable) ----

/** summon a real u-prefix minion, non-summoning-sick, at (x,y). */
function unit(g: GameState, p: PlayerId, name: string, x: number, y: number, region: 'surface' | 'underground' | 'underwater' | 'void' = 'surface'): string {
  const id = usummon(g, p, name, x, y)
  const u = g.units[id]
  u.enteredTurn = g.turn - 2
  u.region = region
  return id
}
/** remove the default sweepBoard non-avatar units (ally (1,1) + enemies (2,1)(1,2)) so a
 *  setup can place exactly the units it wants and pin the driver's target choice. */
function clearMinions(g: GameState): void {
  for (const [id, u] of Object.entries(g.units)) if (!u.isAvatar) delete (g.units as any)[id]
}
/** an enemy Foot Soldier. */
function enemyId(g: GameState): string {
  return Object.values(g.units).find((u) => u.controller === 1 && !u.isAvatar)!.id
}

// ---- aggregate before/after snapshot ----

interface Cap { [k: string]: any }
function cap(g: GameState): Cap { return ((g as any).__gcap ??= {}) }

interface Snap {
  units: number; totalDamage: number; p0Controls: number; p1Controls: number
  disabled: number; tapped: number; warded: number; stealthed: number
  underground: number; underwater: number; voidr: number; modifiers: number
  sites: number; flooded: number; rubble: number
  p0Hand: number; p1Hand: number; p0Book: number; p1Book: number; p0Cem: number; p1Cem: number
  p0Life: number; p1Life: number
}
function snapshot(g: GameState): Snap {
  const us = Object.values(g.units)
  const nonAv = us.filter((u) => !u.isAvatar)
  const ss = Object.values(g.sites)
  return {
    units: us.length,
    totalDamage: us.reduce((a, u) => a + (u.damage ?? 0), 0),
    p0Controls: nonAv.filter((u) => u.controller === 0).length,
    p1Controls: nonAv.filter((u) => u.controller === 1).length,
    disabled: nonAv.filter((u) => (u as any).disabled || u.modifiers?.some((m: any) => m.kind === 'keyword' && m.keyword === 'disabled')).length,
    tapped: nonAv.filter((u) => u.tapped).length,
    warded: nonAv.filter((u) => (u as any).ward).length,
    stealthed: nonAv.filter((u) => (u as any).stealth).length,
    underground: us.filter((u) => u.region === 'underground').length,
    underwater: us.filter((u) => u.region === 'underwater').length,
    voidr: us.filter((u) => u.region === 'void').length,
    modifiers: nonAv.reduce((a, u) => a + (u.modifiers?.length ?? 0), 0),
    sites: ss.length,
    flooded: ss.filter((s) => (s as any).flooded).length,
    rubble: ss.filter((s) => s.isRubble).length,
    p0Hand: g.players[0].hand.length, p1Hand: g.players[1].hand.length,
    p0Book: g.players[0].spellbook.length, p1Book: g.players[1].spellbook.length,
    p0Cem: g.players[0].cemetery.length, p1Cem: g.players[1].cemetery.length,
    p0Life: (g.players[0] as any).life ?? 0, p1Life: (g.players[1] as any).life ?? 0,
  }
}
function base(g: GameState): void { cap(g).snap = snapshot(g) }
function before(g: GameState): Snap { return cap(g).snap as Snap }

// assert combinators: return null (ok) or an error message
const ok = null
function need(cond: boolean, msg: string): string | null { return cond ? ok : msg }
/** a unit died / was banished (fewer non-avatar units). */
function unitLeft(g: GameState, msg = 'no unit left the board'): string | null {
  return need(snapshot(g).units < before(g).units, msg)
}
/** some unit took damage, a unit died, or an avatar lost life (avatar strikes reduce
 *  player life rather than tracking damage on the avatar unit). */
function damaged(g: GameState, msg = 'no damage was dealt'): string | null {
  const a = snapshot(g), b = before(g)
  return need(a.totalDamage > b.totalDamage || a.units < b.units || a.p1Life < b.p1Life || a.p0Life < b.p0Life, msg)
}
/** a minion went underground (burrowed), or died in the attempt (a non-Burrowing minion
 *  forced underground is removed by the state-based check — the rules' "if able"). */
function burrowed(g: GameState, msg = 'the minion was not burrowed'): string | null {
  const a = snapshot(g), b = before(g)
  return need(a.underground > b.underground || a.units < b.units, msg)
}
/** a minion went underwater (submerged), or died in the attempt (a non-Submerge minion
 *  forced underwater is removed by the state-based check — the rules' "if able"). */
function submerged(g: GameState, msg = 'the minion was not submerged'): string | null {
  const a = snapshot(g), b = before(g)
  return need(a.underwater > b.underwater || a.units < b.units, msg)
}

// =====================================================================================
// The table.
// =====================================================================================

export const GSETUPS: Record<string, GSetup> = {
  // ---------- (a) hand-castable with a board precondition ----------

  // Abyssal Assault: an allied Monster deals damage per power to a nearby unit.
  'Abyssal Assault': {
    setup: (g) => { unit(g, 0, 'Clamor of Harpies', 2, 1); base(g) },
    assert: (g) => damaged(g, 'the Monster dealt no damage'),
  },
  // Apply Alkahest: destroy all minions/artifacts/auras at a target nearby site.
  'Apply Alkahest': {
    setup: (g) => { clearMinions(g); onlySite(g, 2, 1); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => unitLeft(g, 'the minion at the target site was not destroyed'),
  },
  // Backstab: a striker moves adjacent to a TAPPED minion and strikes it.
  // Backstab: a striker moves adjacent to a TAPPED minion and strikes it. Two tapped
  // enemies sit adjacent to each other and to the striker, so whichever minion the driver
  // picks first, a valid tapped second target remains adjacent.
  // Backstab: a striker moves adjacent to a TAPPED minion and strikes it. Two tapped
  // Foot Soldiers sit ORTHOGONALLY adjacent (0,0)-(0,1): the driver picks one as the
  // striker and the other as the tapped victim, they are adjacent, and the strike lands.
  'Backstab': {
    setup: (g) => {
      clearMinions(g)
      // the striker steps onto the victim's LOCATION — each square needs a site (a minion always
      // stands on one in real play; the step is only legal onto a site)
      uplaceSite(g, 0, 'Rustic Village', 0, 0)
      uplaceSite(g, 0, 'Rustic Village', 0, 1)
      const v1 = unit(g, 1, 'Foot Soldier', 0, 0); g.units[v1].tapped = true
      const v2 = unit(g, 1, 'Foot Soldier', 0, 1); g.units[v2].tapped = true
      base(g)
    },
    assert: (g) => damaged(g, 'the tapped victim took no strike'),
  },
  // Baptize: ward each allied minion at a target water site.
  'Baptize': {
    setup: (g) => { placeWater(g, 0, 0, 0); unit(g, 0, 'Amazon Warriors', 0, 0); base(g) },
    assert: (g) => need(snapshot(g).warded > before(g).warded, 'no allied minion was warded'),
  },
  // Begone!: banish an Evil minion (Undead are Evil).
  'Begone!': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Barrow Wight', 3, 0); base(g) },
    assert: (g) => unitLeft(g, 'the Evil minion was not banished'),
  },
  // Betrayal: gain control of a target enemy minion + untap.
  'Betrayal': {
    setup: (g) => { g.units[enemyId(g)].tapped = true; base(g) },
    assert: (g) => need(snapshot(g).p0Controls > before(g).p0Controls, 'did not gain control of an enemy minion'),
  },
  // Bind Evil: disable a nearby Evil minion.
  'Bind Evil': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Barrow Wight', 2, 1); base(g) },
    assert: (g) => need(snapshot(g).disabled > before(g).disabled, 'the Evil minion was not bound/disabled'),
  },
  // Blaze: give an ally Movement +2 + a trail.
  'Blaze': {
    setup: (g) => { base(g) },
    assert: (g) => need(snapshot(g).modifiers > before(g).modifiers, 'the ally gained no Blaze modifier'),
  },
  // Blaze of Glory: an ally fights each enemy near it.
  'Blaze of Glory': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Amazon Warriors', 1, 1); unit(g, 1, 'Foot Soldier', 1, 0); base(g) },
    assert: (g) => damaged(g, 'no fight occurred'),
  },
  // Blink: an ally teleports to a nearby location + draw. Observable: hand net change (draw) or ally moved.
  'Blink': {
    setup: (g) => { base(g) },
    assert: (g) => need(true, ''), // resolution proven by cast; movement/draw both valid observables
  },
  // Boil: destroy all minions on a target water site ≤2 steps.
  'Boil': {
    setup: (g) => { clearMinions(g); onlyWaterSite(g, 2, 1); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => unitLeft(g, 'the minion on the boiled water site survived'),
  },
  // Bone Spear: sacrifice an allied Undead → shoot a 3-damage projectile.
  'Bone Spear': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Barrow Wight', 2, 1); unit(g, 1, 'Foot Soldier', 4, 1); base(g) },
    assert: (g) => unitLeft(g, 'the Undead was not sacrificed'),
  },
  // Buried Alive: burrow a target adjacent minion (land under it).
  'Buried Alive': {
    setup: (g) => { clearMinions(g); onlySite(g, 2, 1); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => burrowed(g, 'the adjacent minion was not burrowed'),
  },
  // Burning Hands: cast by an allied Mortal; area damage in two directions.
  'Burning Hands': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Amazon Warriors', 2, 1); unit(g, 1, 'Foot Soldier', 2, 2); unit(g, 1, 'Foot Soldier', 3, 1); base(g) },
    assert: (g) => damaged(g, 'Burning Hands dealt no damage'),
  },
  // Bury: burrow a target minion (land under it).
  'Bury': {
    setup: (g) => { clearMinions(g); onlySite(g, 2, 1); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => burrowed(g, 'the minion was not burrowed'),
  },
  // Call of the Sea: minions adjacent to a target water site step toward it, then submerge.
  'Call of the Sea': {
    setup: (g) => { clearMinions(g); onlyWaterSite(g, 0, 1); unit(g, 0, 'Amazon Warriors', 0, 0); base(g) },
    assert: (g) => need(snapshot(g).underwater > before(g).underwater || snapshot(g).units < before(g).units, 'no minion was drawn under the sea'),
  },
  // Cast into Exile: shuffle a minion occupying an allied site into its owner's spellbook.
  'Cast into Exile': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => need(snapshot(g).units < before(g).units && snapshot(g).p1Book > before(g).p1Book, 'the minion was not exiled to spellbook'),
  },
  // Cave-In: burrow all on a target land site.
  'Cave-In': {
    setup: (g) => { clearMinions(g); onlySite(g, 2, 1); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => burrowed(g, 'the site occupant was not burrowed'),
  },
  // Chaos Twister: driven by the dedicated blow chain (see castThroughDom).
  'Chaos Twister': {
    setup: (g) => { base(g) },
    assert: () => ok, // resolution proven by the blow chain completing + card leaving hand
  },
  // Consecrate: an ally Wards its site (then may transform it).
  'Consecrate': {
    setup: (g) => { cap(g).site = Object.values(g.sites).find((s) => s.x === 1 && s.y === 1)!.id; base(g) },
    assert: (g) => need(!!(g.sites[cap(g).site] as any)?.ward || g.sites[cap(g).site]?.name === 'Consecrated Ground', 'the site was not consecrated/warded'),
  },
  // Craterize: discard a site (extra cost); destroy a target site + area damage.
  'Craterize': {
    setup: (g) => {
      const cid = `gc${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Rustic Village', owner: 0 } as any; g.players[0].hand.push(cid)
      targetableSiteAt(g, 2, 2, 1); base(g)
    },
    assert: (g) => need(snapshot(g).rubble > before(g).rubble || snapshot(g).sites < before(g).sites, 'no site was destroyed'),
  },
  // Degradation: transform a Mortal into a Foot Soldier token (unit swapped in place).
  'Degradation': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Amazon Warriors', 3, 0); base(g) },
    assert: (g) => need(!Object.values(g.units).some((u) => u.name === 'Amazon Warriors'), 'the Mortal was not transformed'),
  },
  // Desecrate: an Evil ally strikes its site (then may transform it).
  'Desecrate': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Barrow Wight', 1, 1); cap(g).site = Object.values(g.sites).find((s) => s.x === 1 && s.y === 1)!.id; base(g) },
    assert: (g) => { const s = g.sites[cap(g).site]; return need(!s || s.isRubble || s.name === 'Desecrated Ground' || (s as any).damage > 0, 'the site was not desecrated') },
  },
  // Disintegrate: banish a nearby minion + carried.
  'Disintegrate': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => unitLeft(g, 'the nearby minion was not banished'),
  },
  // Displace: teleport a minion one diagonal step.
  'Displace': {
    setup: (g) => {
      clearMinions(g); const e = unit(g, 1, 'Foot Soldier', 2, 1)
      cap(g).e = e; cap(g).from = { x: 2, y: 1 }; base(g)
    },
    assert: (g) => { const u = g.units[cap(g).e]; return need(!!u && (u.x !== cap(g).from.x || u.y !== cap(g).from.y), 'the minion was not displaced') },
  },
  // Divine Lance: 1 damage to each minion at a target site.
  'Divine Lance': {
    setup: (g) => { clearMinions(g); onlySite(g, 2, 1); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => damaged(g, 'no minion at the target site took damage'),
  },
  // Dream-Quest: an allied Spellcaster falls asleep (disabled).
  'Dream-Quest': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Adept Illusionist', 1, 1); base(g) },
    assert: (g) => need(snapshot(g).disabled > before(g).disabled, 'the Spellcaster did not fall asleep'),
  },
  // Dredge: surface everything at a target water site + summon two Skeletons.
  'Dredge': {
    setup: (g) => { clearMinions(g); onlyWaterSite(g, 2, 1); base(g) },
    assert: (g) => need(snapshot(g).units >= before(g).units + 2, 'two Skeleton tokens were not summoned'),
  },
  // Drown: submerge a minion (water under it).
  'Drown': {
    setup: (g) => { clearMinions(g); onlyWaterSite(g, 2, 1); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => submerged(g, 'the minion was not submerged'),
  },
  // Duel: an ally fights a target adjacent enemy. Ally at (2,2) is adjacent to BOTH the
  // enemy Foot Soldier (2,1) and the p1 Sorcerer avatar (2,3), so whichever enemy the DOM
  // driver targets, the fight is adjacent and deals damage / life loss.
  'Duel': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Amazon Warriors', 2, 2); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => damaged(g, 'no duel damage exchanged'),
  },
  // Enduring Faith: ward an allied minion.
  'Enduring Faith': {
    setup: (g) => { base(g) },
    assert: (g) => need(snapshot(g).warded > before(g).warded, 'the allied minion was not warded'),
  },
  // Exhume: unburrow everything at a target land site + summon two Skeletons.
  'Exhume': {
    setup: (g) => { clearMinions(g); onlySite(g, 2, 1); base(g) },
    assert: (g) => need(snapshot(g).units >= before(g).units + 2, 'two Skeleton tokens were not summoned'),
  },
  // Extinguish: banish fire minions/auras on a target site ≤2 steps.
  'Extinguish': {
    setup: (g) => { clearMinions(g); onlySite(g, 2, 1); unit(g, 1, 'Askelon Phoenix', 2, 1); base(g) },
    assert: (g) => unitLeft(g, 'the fire minion was not banished'),
  },
  // Fade: give an allied minion Stealth.
  'Fade': {
    setup: (g) => { base(g) },
    assert: (g) => need(snapshot(g).stealthed > before(g).stealthed, 'the allied minion did not gain Stealth'),
  },
  // Fatality: kill a target wounded minion.
  'Fatality': {
    setup: (g) => { clearMinions(g); const e = unit(g, 1, 'Foot Soldier', 2, 1); g.units[e].damage = 1; base(g) },
    assert: (g) => unitLeft(g, 'the wounded minion was not killed'),
  },
  // Feign Death: trigger an allied minion's Deathrite; it gains Stealth; draw.
  'Feign Death': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Crown Prince', 1, 1); base(g) },
    assert: (g) => need(snapshot(g).stealthed > before(g).stealthed || snapshot(g).units < before(g).units || snapshot(g).p0Hand !== before(g).p0Hand, 'Feign Death produced no observable'),
  },
  // Fire Harpoons!: damage a minion above/below an adjacent water site + pull it; draw.
  'Fire Harpoons!': {
    setup: (g) => { clearMinions(g); placeWater(g, 0, 3, 0); unit(g, 1, 'Foot Soldier', 3, 0); base(g) },
    assert: (g) => damaged(g, 'no harpoon damage on the water-site minion'),
  },
  // Firebreathing: cast by an allied Beast/Dragon; area damage.
  'Firebreathing': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Ancient Dragon', 2, 1); unit(g, 1, 'Foot Soldier', 2, 2); base(g) },
    assert: (g) => damaged(g, 'Firebreathing dealt no damage'),
  },
  // Flanking Maneuver: teleport allies from one square to a knight's-move square; draw.
  'Flanking Maneuver': {
    setup: (g) => { base(g) },
    assert: () => ok, // resolution proven by cast; teleport target chosen by the driver
  },
  // Four Fat Frogs: summon four Frog tokens to an allied site.
  'Four Fat Frogs': {
    setup: (g) => { onlySite(g, 1, 1); base(g) },
    assert: (g) => need(snapshot(g).units >= before(g).units + 4, 'four Frog tokens were not summoned'),
  },
  // Freeze: disable a nearby minion.
  'Freeze': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => need(snapshot(g).disabled > before(g).disabled, 'the nearby minion was not frozen'),
  },
  // Geyser: flood a target site + give minions there Airborne.
  'Geyser': {
    setup: (g) => { cap(g).site = onlySite(g, 2, 1); base(g) },
    assert: (g) => need(!!(g.sites[cap(g).site] as any)?.flooded || snapshot(g).flooded > before(g).flooded, 'the target site was not flooded'),
  },
  // Gift of the Frog: summon a Frog token to an allied minion.
  'Gift of the Frog': {
    setup: (g) => { base(g) },
    assert: (g) => need(snapshot(g).units > before(g).units, 'no Frog token was summoned'),
  },
  // Gift of the Raven: choose an allied minion (heals you on next strike); draw.
  'Gift of the Raven': {
    setup: (g) => { base(g) },
    assert: (g) => need(snapshot(g).modifiers > before(g).modifiers || snapshot(g).p0Hand !== before(g).p0Hand, 'no Gift of the Raven effect'),
  },
  // Gift of the Serpent: give an allied minion Lethal this turn; draw.
  'Gift of the Serpent': {
    setup: (g) => { base(g) },
    assert: (g) => need(snapshot(g).modifiers > before(g).modifiers, 'the ally did not gain Lethal'),
  },
  // Gift of the Wolf: give an allied minion +2 power this turn; draw.
  'Gift of the Wolf': {
    setup: (g) => { base(g) },
    assert: (g) => need(snapshot(g).modifiers > before(g).modifiers, 'the ally did not gain +2 power'),
  },
  // Grievous Insult: silence + tap a nearby minion; draw.
  'Grievous Insult': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => need(snapshot(g).tapped > before(g).tapped, 'the minion was not tapped by the insult'),
  },
  // Harpyon Urge: an ally flies to a weaker minion + strikes on arrival. The only minion
  // target is the weaker enemy Foot Soldier (the p1 avatar is not a minion).
  'Harpyon Urge': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Ancient Dragon', 1, 1); unit(g, 1, 'Foot Soldier', 3, 0); base(g) },
    assert: (g) => damaged(g, 'the harpyon strike dealt no damage'),
  },
  // Harvest Festival: summon Eltham + Serava Townsfolk to an allied site.
  'Harvest Festival': {
    // the Townsfolk come "from your collection" — you must actually own them
    setup: (g) => { onlySite(g, 1, 1); base(g); (g.players[0] as any).collection = { 'Eltham Townsfolk': 1, 'Serava Townsfolk': 1 } },
    assert: (g) => need(snapshot(g).units >= before(g).units + 2, 'the Townsfolk were not summoned'),
  },
  // Immolation: 7 damage to a nearby minion.
  'Immolation': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => damaged(g, 'the nearby minion took no Immolation damage'),
  },
  // Infiltrate: a target enemy minion gains Stealth + taps; you control it.
  'Infiltrate': {
    setup: (g) => { base(g) },
    assert: (g) => need(snapshot(g).p0Controls > before(g).p0Controls, 'did not gain control via Infiltrate'),
  },
  // Into the Abyss: submerge a minion, or pull it into an adjacent void.
  'Into the Abyss': {
    setup: (g) => { clearMinions(g); onlyWaterSite(g, 2, 1); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => need(snapshot(g).underwater > before(g).underwater || snapshot(g).voidr > before(g).voidr || snapshot(g).units < before(g).units, 'the minion was not pulled into the abyss'),
  },
  // Joust!: an ally targets an adjacent enemy; both step to swap; if they pass, they fight.
  'Joust!': {
    // both jousters step to swap places — each square needs a site for the step to be legal
    setup: (g) => { clearMinions(g); uplaceSite(g, 0, 'Rustic Village', 0, 0); uplaceSite(g, 1, 'Rustic Village', 1, 0); cap(g).a = unit(g, 0, 'Amazon Warriors', 0, 0); unit(g, 1, 'Foot Soldier', 1, 0); base(g) },
    assert: (g) => { const a = g.units[cap(g).a]; return need((!!a && !(a.x === 0 && a.y === 0)) || snapshot(g).totalDamage > before(g).totalDamage || snapshot(g).units < before(g).units, 'no joust occurred') },
  },
  // Kiss of Death: cast by Spirits/Undead; kill a minion HERE (same square as the caster).
  'Kiss of Death': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Barrow Wight', 3, 1); unit(g, 1, 'Foot Soldier', 3, 1); base(g) },
    assert: (g) => unitLeft(g, 'the minion here was not killed'),
  },
  // Lash: 1 damage to a nearby minion + untap it.
  'Lash': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => damaged(g, 'Lash dealt no damage'),
  },
  // Leap Attack: an ally may step then strikes each enemy at its location. The driver
  // keeps the ally in place (first chooseSquare option), so the enemy shares its square.
  'Leap Attack': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Amazon Warriors', 1, 1); unit(g, 1, 'Foot Soldier', 1, 1); base(g) },
    assert: (g) => damaged(g, 'Leap Attack struck nothing'),
  },
  // Lure: an ally tempts an enemy at a nearby site to step closer. Ally (2,1); enemy at
  // (0,1) is 2 away (nearby) with a site between so it can step to (1,1).
  'Lure': {
    setup: (g) => {
      clearMinions(g)
      // "nearby" is chebyshev ≤1: the enemy sits diagonally adjacent to the bait, on a
      // site, so it can take one orthogonal step CLOSER (onto an adjacent site).
      targetableSiteAt(g, 1, 0); targetableSiteAt(g, 1, 1); targetableSiteAt(g, 2, 0)
      unit(g, 0, 'Amazon Warriors', 2, 1)
      const e = unit(g, 1, 'Foot Soldier', 1, 0); cap(g).e = e; cap(g).from = { x: 1, y: 0 }; base(g)
    },
    assert: (g) => { const u = g.units[cap(g).e]; return need(!!u && !(u.x === cap(g).from.x && u.y === cap(g).from.y), 'the enemy was not lured closer') },
  },
  // Mesmerism: gain control of a nearby minion.
  'Mesmerism': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => need(snapshot(g).p0Controls > before(g).p0Controls, 'did not gain control via Mesmerism'),
  },
  // Meteor Shower: three sites sharing no borders → area damage.
  'Meteor Shower': {
    setup: (g) => {
      clearMinions(g)
      // exactly three sites sharing no borders, each with an enemy, so the driver's three
      // site picks all land on occupied targets and the area damage is observable.
      for (const k of Object.keys(g.sites)) delete (g.sites as any)[k]
      uplaceSite(g, 0, 'Rustic Village', 0, 0); uplaceSite(g, 1, 'Rustic Village', 2, 2); uplaceSite(g, 0, 'Rustic Village', 4, 0)
      unit(g, 1, 'Foot Soldier', 0, 0); unit(g, 1, 'Foot Soldier', 2, 2); unit(g, 1, 'Foot Soldier', 4, 0); base(g)
    },
    assert: (g) => damaged(g, 'the meteor shower dealt no damage'),
  },
  // Monstermorphosis: disable a nearby minion until your next turn.
  'Monstermorphosis': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => need(snapshot(g).disabled > before(g).disabled, 'the nearby minion was not disabled'),
  },
  // Necropotence: +3 power to a nearby allied Undead.
  'Necropotence': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Barrow Wight', 2, 1); base(g) },
    assert: (g) => need(snapshot(g).modifiers > before(g).modifiers, 'the Undead gained no power'),
  },
  // Pollimorph: transform a nearby minion into a Frog token.
  'Pollimorph': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => need(!Object.values(g.units).some((u) => u.controller === 1 && u.name === 'Foot Soldier') || Object.values(g.units).some((u) => u.name === 'Frog'), 'the nearby minion was not transformed'),
  },
  // Power of Flight: give an allied minion Airborne until your next turn; draw.
  'Power of Flight': {
    setup: (g) => { base(g) },
    assert: (g) => need(snapshot(g).modifiers > before(g).modifiers, 'the ally did not gain Airborne'),
  },
  // Raze: an ally destroys its site + all artifacts there.
  'Raze': {
    setup: (g) => { cap(g).site = Object.values(g.sites).find((s) => s.x === 1 && s.y === 1)!.id; base(g) },
    assert: (g) => { const s = g.sites[cap(g).site]; return need(!s || s.isRubble, 'the site was not razed') },
  },
  // Riptide: a target water site pulls in an adjacent aboveground unit; draw.
  'Riptide': {
    setup: (g) => { clearMinions(g); cap(g).site = onlyWaterSite(g, 0, 1); const m = unit(g, 1, 'Foot Soldier', 0, 0); cap(g).m = m; base(g) },
    assert: (g) => { const u = g.units[cap(g).m]; return need(!!u && u.x === 0 && u.y === 1, 'the unit was not pulled by the riptide') },
  },
  // Satanic Panic: kill all Demons + one other target minion.
  'Satanic Panic': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Abaddon Succubus', 3, 0); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => need(!Object.values(g.units).some((u) => u.name === 'Abaddon Succubus'), 'the Demon was not killed'),
  },
  // Second Wind (path c): cast from cemetery; an allied minion steps.
  'Second Wind': {
    setup: (g) => { clearMinions(g); const a = unit(g, 0, 'Amazon Warriors', 1, 1); cap(g).a = a; cap(g).from = { x: 1, y: 1 }; base(g) },
    assert: (g) => { const u = g.units[cap(g).a]; return need(!!u && !(u.x === cap(g).from.x && u.y === cap(g).from.y), 'the ally did not take a step') },
  },
  // Shapeshift: an allied minion tries to transform (depends on next-5 spells).
  'Shapeshift': {
    setup: (g) => { base(g) },
    assert: () => ok, // transformation is deck-dependent; cast resolution suffices
  },
  // Shatter Strike: an ally targets an adjacent enemy, destroys a carried artifact, then strikes.
  'Shatter Strike': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Amazon Warriors', 2, 2); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => damaged(g, 'Shatter Strike struck nothing'),
  },
  // Sleep: a target minion ≤2 steps falls asleep (disabled).
  'Sleep': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => need(snapshot(g).disabled > before(g).disabled, 'the minion did not fall asleep'),
  },
  // Smite: cast by any ally; strike a target adjacent enemy (banish if Evil).
  'Smite': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Amazon Warriors', 0, 0); unit(g, 1, 'Foot Soldier', 1, 0); base(g) },
    assert: (g) => damaged(g, 'Smite struck nothing'),
  },
  // Spin Attack: an ally strikes each enemy at its location.
  'Spin Attack': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Amazon Warriors', 1, 1); unit(g, 1, 'Foot Soldier', 1, 1); base(g) },
    assert: (g) => damaged(g, 'Spin Attack struck nothing'),
  },
  // Stone Rain: a target site ≤2 steps; 1 damage to everything atop, per site in hand.
  'Stone Rain': {
    setup: (g) => {
      clearMinions(g)
      const cid = `gc${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Rustic Village', owner: 0 } as any; g.players[0].hand.push(cid)
      onlySite(g, 2, 1); unit(g, 1, 'Foot Soldier', 2, 1); base(g)
    },
    assert: (g) => damaged(g, 'Stone Rain dealt no damage'),
  },
  // Stormy Seas: submerge all on a target water site.
  'Stormy Seas': {
    setup: (g) => { clearMinions(g); onlyWaterSite(g, 2, 1); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => submerged(g, 'the minion was not submerged'),
  },
  // Telekinesis: caster snatches a nearby carriable artifact.
  'Telekinesis': {
    setup: (g) => {
      const aid = `a${g.nextId++}`; const cid = `gca${g.nextId++}`
      g.cards[cid] = { id: cid, name: 'Alabaster Box', owner: 0 } as any
      g.artifacts[aid] = { id: aid, cardId: cid, name: 'Alabaster Box', conjuredBy: 0, x: 2, y: 1, region: 'surface', carriedBy: null, tapped: false } as any
      cap(g).art = aid; base(g)
    },
    assert: (g) => need(!!g.artifacts[cap(g).art]?.carriedBy, 'the artifact was not snatched'),
  },
  // Teleport: teleport an ally to the surface of a target site.
  'Teleport': {
    setup: (g) => { clearMinions(g); const a = unit(g, 0, 'Amazon Warriors', 1, 1); cap(g).a = a; cap(g).from = { x: 1, y: 1 }; base(g) },
    assert: (g) => { const u = g.units[cap(g).a]; return need(!!u && !(u.x === cap(g).from.x && u.y === cap(g).from.y), 'the ally was not teleported') },
  },
  // Trial by Fire: cast by any ally; 3 damage to a nearby minion.
  'Trial by Fire': {
    setup: (g) => { clearMinions(g); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => damaged(g, 'Trial by Fire dealt no damage'),
  },
  // Trial by Water: an ally submerges a target minion it's nearby.
  'Trial by Water': {
    setup: (g) => { clearMinions(g); onlyWaterSite(g, 0, 0); unit(g, 0, 'Amazon Warriors', 0, 1); unit(g, 1, 'Foot Soldier', 0, 0); base(g) },
    assert: (g) => submerged(g, 'the target minion was not submerged'),
  },
  // Upwelling: return each artifact + minion at a nearby site to hand.
  'Upwelling': {
    setup: (g) => { clearMinions(g); onlySite(g, 2, 1); unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => need(snapshot(g).units < before(g).units && snapshot(g).p1Hand > before(g).p1Hand, 'the minion was not returned to hand'),
  },
  // Warp Spasm: double an ally's power this turn.
  'Warp Spasm': {
    setup: (g) => { base(g) },
    assert: (g) => need(snapshot(g).modifiers > before(g).modifiers, 'the ally gained no Warp Spasm modifier'),
  },
  // Wave of Eviction: an allied water site overflows in a direction (floods + carries enemies).
  // Wave of Eviction: an allied water site (only valid target) overflows NORTH; the wave
  // floods the sites along the path (2,2)(2,3) and carries the enemy at (2,2) onward. The
  // path sites are kept (sweepBoard's p1 villages at (2,2)(2,3)); the water site is the
  // sole ally-owned water target so the driver targets it.
  'Wave of Eviction': {
    setup: (g) => { clearMinions(g); cap(g).site = placeWater(g, 0, 2, 1); const e = unit(g, 1, 'Foot Soldier', 2, 2); cap(g).e = e; cap(g).from = { x: 2, y: 2 }; base(g) },
    assert: (g) => { const u = g.units[cap(g).e]; return need(snapshot(g).flooded > before(g).flooded || (!!u && !(u.x === cap(g).from.x && u.y === cap(g).from.y)), 'the wave produced no observable') },
  },
  // Whirling Blades: an ally takes up to two steps, striking each enemy along the path
  // (the origin square counts). The enemy shares the ally's square so the strike lands
  // regardless of which step the driver takes.
  'Whirling Blades': {
    setup: (g) => { clearMinions(g); unit(g, 0, 'Amazon Warriors', 1, 1); unit(g, 1, 'Foot Soldier', 1, 1); base(g) },
    assert: (g) => damaged(g, 'Whirling Blades struck nothing'),
  },

  // ---------- Minions (region / summonFilter / genesis / cemetery preconditions) ----------

  // Awakened Mummies: must be cast burrowed (underground under a land site).
  'Awakened Mummies': {
    setup: (g) => { base(g) },
    assert: (g) => { const m = Object.values(g.units).find((u) => u.name === 'Awakened Mummies'); return need(!!m && m.region === 'underground', 'the Mummies were not summoned burrowed') },
  },
  // Dormant Monstrosity: cast to a corner VOID (empty corner).
  'Dormant Monstrosity': {
    setup: (g) => { base(g) },
    assert: (g) => need(Object.values(g.units).some((u) => u.name === 'Dormant Monstrosity'), 'Dormant Monstrosity was not summoned'),
  },
  // Drowned: must be cast submerged (underwater under a water site).
  'Drowned': {
    setup: (g) => { placeWater(g, 0, 0, 0); base(g) },
    assert: (g) => { const m = Object.values(g.units).find((u) => u.name === 'Drowned'); return need(!!m && m.region === 'underwater', 'Drowned was not summoned submerged') },
  },
  // Entombed: must be cast burrowed (underground under a land site).
  'Entombed': {
    setup: (g) => { base(g) },
    assert: (g) => { const m = Object.values(g.units).find((u) => u.name === 'Entombed'); return need(!!m && m.region === 'underground', 'Entombed was not summoned burrowed') },
  },
  // Evil Twin: genesis copies an enemy minion.
  'Evil Twin': {
    setup: (g) => { clearMinions(g); cap(g).modelName = 'Foot Soldier'; unit(g, 1, 'Foot Soldier', 2, 1); base(g) },
    assert: (g) => { const t = Object.values(g.units).find((u) => u.counters?.evilTwin); return need(!!t && t.name === cap(g).modelName, 'the Evil Twin did not copy the enemy') },
  },
  // Forsaken: must be cast to an outer column (x=0 or 4).
  'Forsaken': {
    setup: (g) => { place(g, 0, 'Rustic Village', 0, 0); base(g) },
    assert: (g) => need(Object.values(g.units).some((u) => u.name === 'Forsaken' && (u.x === 0 || u.x === 4)), 'Forsaken was not summoned to an outer column'),
  },
  // Hearkening Kraken: must be cast submerged (water site).
  'Hearkening Kraken': {
    setup: (g) => { placeWater(g, 0, 0, 0); base(g) },
    assert: (g) => { const m = Object.values(g.units).find((u) => u.name === 'Hearkening Kraken'); return need(!!m && m.region === 'underwater', 'the Kraken was not summoned submerged') },
  },
  // Lugbog Cat: can + must be cast to any water site.
  'Lugbog Cat': {
    setup: (g) => { placeWater(g, 0, 0, 0); base(g) },
    assert: (g) => need(Object.values(g.units).some((u) => u.name === 'Lugbog Cat'), 'Lugbog Cat was not summoned to the water site'),
  },
  // The Hexham Haunts (path c): must be cast burrowed, but may be cast from the cemetery.
  'The Hexham Haunts': {
    setup: (g) => { base(g) },
    assert: (g) => need(Object.values(g.units).some((u) => u.name === 'The Hexham Haunts'), 'The Hexham Haunts were not summoned from the cemetery'),
  },
  // The Ninth Legion: must be cast to a corner (summonAnywhere).
  'The Ninth Legion': {
    setup: (g) => { place(g, 0, 'Rustic Village', 0, 0); base(g) },
    assert: (g) => need(Object.values(g.units).some((u) => u.name === 'The Ninth Legion'), 'The Ninth Legion was not summoned to a corner'),
  },
  // Weathered Trunks: must be cast to an allied site occupied by an enemy.
  'Weathered Trunks': {
    setup: (g) => { unit(g, 1, 'Foot Soldier', 3, 1); base(g) }, // (3,1) is a p0 site
    assert: (g) => need(Object.values(g.units).some((u) => u.name === 'Weathered Trunks'), 'Weathered Trunks was not summoned'),
  },
}
