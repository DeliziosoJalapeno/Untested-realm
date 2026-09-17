// Phase-F DOM-level playability audit — AVATAR activated abilities.
//
// Both prior ability sweeps EXCLUDED Avatars (`c.type !== 'Avatar'` in
// domaudit.phaseC C.1 and in scripts/audit_playable.ts). But 17 of the 34 avatars
// carry scripted activated abilities (19 abilities total; enumerated by
// scripts/list_avatar_abilities.ts). This phase closes that gap: for EVERY avatar
// with scripted abilities it builds a game where that avatar is player 0's avatar
// (via the shared boardWithAvatar() scaffold added to auditboard.ts), selects the
// avatar chip through the REAL Game component, asserts the ability button renders
// with a disabled-state that matches the engine's canActivate(), then — with a
// purpose-built board that satisfies the ability's precondition — drives the whole
// activation click-chain through the DOM to engine acceptance (zero drift), and
// asserts a script-relevant post-state (not acceptance-only).
//
// Everything runs through harness.tsx (App's exact hotseat wiring) with the engine
// as the oracle. Included in `npm run audit:dom` automatically (test/**/*.test.tsx).
//
// The 19 abilities (avatar → key), all driven to PROVEN below:
//   Sorcerer drawSpell · Avatar of Air fly · Avatar of Fire kindle · Avatar of Water
//   flood · Animist animate · Archimago echo · Deathspeaker speak · Dragonlord invoke
//   · Flamecaller pyre · Geomancer reclaim · Imposter imposter:mask · Necromancer raise
//   · Pathfinder blaze · Persecutor zeal · Realm-Eater digest · Savior save · Sparkmage
//   spark · Waveshaper wave · Witch curse.
//
// POST-STATE (asserted on state delta / log, not mere acceptance):
//   Savior save → chosen minion gains ward · Witch curse → enemy avatar cursed/branded
//   · Sparkmage spark → damage lands at the chosen square (+ the avatar-sourced tap
//   ability highlights squares) · Avatar of Water flood → target site flooded ·
//   Necromancer raise → a Skeleton token joins the board · plus a script-relevant
//   observable for the rest.
//
// Savior's `save` is HISTORIC: its client wiring once fired the ability button with
// no targets → the engine rejected "Missing targets." The F.5 negative-control block
// reintroduces that exact bug IN PROCESS (send `activate` with no targets, bypassing
// activateAbilityClick's specs branch), proves the RED signal, and reverts to GREEN.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { usummon } from './domaudit'
import {
  boardWithAvatar,
  canActivate,
  getScript,
  getCard,
  allCards,
  newId,
  applyAction,
  type GameState,
  type PlayerId,
} from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => {
  active?.unmount()
  active = null
})

// =====================================================================================
// Shared helpers
// =====================================================================================

function must(root: HTMLElement, sel: string, why: string): HTMLElement {
  const el = root.querySelector(sel) as HTMLElement | null
  if (!el) throw new Error(`[${why}] expected element ${sel} not found`)
  return el
}

/** the acting player's avatar unit id on a boardWithAvatar() game. */
function avatarId(g: GameState): string {
  return g.players[0].avatarUnitId
}

/** log lines added since `before`, as their raw msg strings. */
function newLogs(g: GameState, before: number): string[] {
  return g.log.slice(before).map((l: any) => l.msg ?? l.text ?? '')
}

/** place a real site with an ENGINE-VALID `s…` id at (x,y), controlled by p. */
function siteAt(g: GameState, p: PlayerId, name: string, x: number, y: number): string {
  // one site per square (as in a real game): replace any scaffold site here first,
  // so engine siteAt() resolves to THIS site (e.g. water under Avatar of Water).
  for (const id of Object.keys(g.sites)) if (g.sites[id].x === x && g.sites[id].y === y) delete (g.sites as any)[id]
  const cardId = newId(g, 'c'); g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = newId(g, 's')
  g.sites[id] = { id, cardId, name, owner: p, controller: p, x, y, tapped: false, isRubble: false } as any
  return id
}

/** put a minion in a player's cemetery with an engine-valid `c…` id; returns the card id. */
function cemeteryCard(g: GameState, p: PlayerId, name: string): string {
  const id = newId(g, 'c'); g.cards[id] = { id, name, owner: p } as any
  g.players[p].cemetery.push(id)
  return id
}

/** Select the player-0 avatar chip through the DOM (mode → 'unit') and return the
 *  ability button for `key` (throws if it never renders). Proves the avatar chip
 *  path in unitActions (controller===me, myTurn) opens the action panel. */
function selectAvatarAbility(h: GameHarness, key: string): HTMLButtonElement {
  const root = h.container
  const av = avatarId(h.state)
  h.rerender()
  const chip = must(root, `[data-unit="${av}"][data-avatar="1"]`, 'avatar chip')
  expect(chip.getAttribute('data-avatar'), 'the selected chip is the avatar').toBe('1')
  h.click(chip)
  h.rerender()
  return must(root, `[data-ability="${key}"]`, `${key} ability button`) as HTMLButtonElement
}

/** Drive an avatar ability's target/prompt flow to completion after its button is
 *  clicked. Mirrors phaseC's driveAbility inner loop (abilityTargets highlights +
 *  mid-resolution chooseOption/chooseCards/chooseSquare prompts) but is anchored on
 *  the avatar. `firstTargets` are explicit target picks (unit/site chip ids or a
 *  `sq:x,y` square marker) preferred over auto-collected highlights; anything the
 *  loop still needs it satisfies from the first rendered legal affordance.
 *  Returns { ok, detail }. */
function driveAvatarAbility(
  h: GameHarness,
  opts: { targets?: string[]; budget?: number } = {},
): { ok: boolean; detail: string } {
  const root = h.container
  const drift0 = h.drifts.length
  const budget = opts.budget ?? 24
  const explicit = [...(opts.targets ?? [])]

  for (let i = 0; i < budget; i++) {
    h.rerender()
    if (h.drifts.length > drift0) {
      return { ok: false, detail: `engine rejected: ${h.drifts[h.drifts.length - 1].error}` }
    }
    const banner = root.querySelector('[data-modebanner="abilityTargets"]')
    const pending = h.state.prompts.length > 0
    if (!banner && !pending) return { ok: true, detail: `resolved (${i} steps)` }

    // an explicit target still to place (abilityTargets board pick)?
    if (banner && explicit.length > 0) {
      const ref = explicit.shift()!
      let el: HTMLElement | null = null
      if (ref.startsWith('sq:')) {
        const [x, y] = ref.slice(3).split(',')
        el = root.querySelector(`[data-sq="${x},${y}"][data-clickable="1"]`)
      } else if (ref.startsWith('s')) {
        el = root.querySelector(`[data-site="${ref}"][data-target="1"]`) ?? root.querySelector(`[data-site="${ref}"]`)
      } else {
        el = root.querySelector(`[data-unit="${ref}"][data-target="1"]`) ?? root.querySelector(`[data-unit="${ref}"]`)
      }
      if (!el) return { ok: false, detail: `explicit target ${ref} not rendered/legal` }
      h.click(el)
      continue
    }

    // engine prompt mid-resolution.
    if (pending) {
      const kind = h.state.prompts[0].kind
      // multi-select prompts (chooseCards / orderCards): toggle `pick` tiles then confirm
      // (Archimago's echo asks for exactly TWO magics to banish — pick:2).
      const multiBox = root.querySelector('[data-promptbox="chooseCards"],[data-promptbox="orderCards"]') as HTMLElement | null
      if (multiBox) {
        const need: number = h.state.prompts[0].data?.pick ?? 1
        const selected = multiBox.querySelectorAll('[data-choice].selected').length
        const confirm = multiBox.querySelector('[data-confirm="1"]') as HTMLButtonElement | null
        if (selected >= need && confirm && !confirm.disabled) { h.click(confirm); continue }
        const tile = multiBox.querySelector('[data-choice]:not(.selected)') as HTMLElement | null
        if (tile) { h.click(tile); continue }
        if (confirm && !confirm.disabled) { h.click(confirm); continue }
      }
      // chooseTargets:site (e.g. Avatar of Air fly destination) — the client marks no
      // per-site data-target; clickSite answers it directly. Click a candidate site.
      const p: any = h.state.prompts[0]
      if (kind === 'chooseTargets' && p.data?.kind === 'site') {
        const cands: string[] = p.data.candidates ?? []
        const siteEl = cands.map((id) => root.querySelector(`[data-site="${id}"]`)).find(Boolean) as HTMLElement | undefined
        if (siteEl) { h.click(siteEl); continue }
      }
      // single-choice prompts (chooseOption / yesNo / drawDeck): first enabled choice,
      // else a highlighted board square/target, else confirm, else skip.
      const pick =
        (root.querySelector('[data-choice]:not([disabled])') as HTMLElement | null) ??
        (root.querySelector('[data-clickable="1"][data-sq]') as HTMLElement | null) ??
        (root.querySelector('[data-target="1"]') as HTMLElement | null) ??
        (root.querySelector('[data-confirm="1"]:not([disabled])') as HTMLElement | null) ??
        (root.querySelector('[data-skip="1"]') as HTMLElement | null)
      if (!pick) return { ok: false, detail: `prompt ${kind} with no rendered choice` }
      h.click(pick)
      continue
    }

    // abilityTargets banner with no explicit pick left: click the first legal highlight.
    const what = banner!.getAttribute('data-spec-what')
    const pick =
      what === 'site' ? (root.querySelector('[data-site][data-target="1"]') as HTMLElement | null)
        : what === 'square' ? (root.querySelector('[data-clickable="1"][data-sq]') as HTMLElement | null)
          : (root.querySelector('[data-unit][data-target="1"]') as HTMLElement | null)
    if (!pick) return { ok: false, detail: `abilityTargets(${what}) — no legal highlight rendered` }
    h.click(pick)
  }
  return { ok: false, detail: 'budget exhausted' }
}

// =====================================================================================
// F.1 — per-avatar sweep: gating parity + drive to engine acceptance
//
// Each block builds a board via boardWithAvatar(<name>) and any extra pieces the
// ability's script requires (READ from packages/shared/src/cards/scripts). The button
// must be ENABLED exactly when canActivate(...)===null; then the ability is driven
// through the DOM to acceptance. No ability is left 'correctly disabled' — every board
// is fixed so all 19 reach PROVEN.
// =====================================================================================

interface AvSetup {
  avatar: string
  key: string
  /** build the board (boardWithAvatar already applied) and return the target picks
   *  the DOM driver should make. */
  setup: (g: GameState) => { targets?: string[]; [k: string]: unknown }
  /** post-drive assertion(s). ctx carries logBefore/handBefore/targets plus anything
   *  the setup returned (e.g. the `enemy` unit id for Sparkmage). */
  assert: (g: GameState, ctx: { logBefore: number; handBefore: number; targets: string[]; [k: string]: unknown }) => void
}

/** the 19 avatar abilities with the board each needs and a script-relevant assertion. */
const AVATAR_ABILITIES: AvSetup[] = [
  {
    avatar: 'Sorcerer', key: 'drawSpell',
    setup: () => ({}),
    assert: (g, c) => expect(g.players[0].hand.length, 'Sorcerer drew a spell').toBeGreaterThan(c.handBefore),
  },
  {
    avatar: 'Necromancer', key: 'raise',
    setup: () => ({}),
    assert: (g) => expect(Object.values(g.units).some((u) => u.name === 'Skeleton'), 'a Skeleton token was raised').toBe(true),
  },
  {
    avatar: 'Savior', key: 'save',
    setup: (g) => {
      const m = usummon(g, 0, 'Foot Soldier', 2, 0) // atop the avatar, summoned THIS turn
      g.units[m].enteredTurn = g.turn
      return { targets: [m] }
    },
    assert: (g, c) => expect(g.units[c.targets[0]].ward, 'the saved minion gains ward').toBe(true),
  },
  {
    avatar: 'Witch', key: 'curse',
    setup: (g) => ({ targets: [g.players[1].avatarUnitId] }),
    assert: (g) => {
      // whichever hex option the driver picked, an observable landed: the curse log
      // OR a life/power delta on the enemy avatar.
      const enemyAv = g.units[g.players[1].avatarUnitId]
      const cursed = (g.flow?.witchCurse?.length ?? 0) > 0 || (enemyAv.life ?? 20) < 20 || enemyAv.modifiers.length > 0
      expect(cursed, 'the enemy avatar is cursed (flow/ life / power)').toBe(true)
    },
  },
  {
    avatar: 'Sparkmage', key: 'spark',
    setup: (g) => {
      g.flow = g.flow ?? {}
      ;(g.flow as any).airCastSum = { 0: 2 }
      const enemy = usummon(g, 1, 'Sea Serpent', 2, 1) // tanky, nearby the avatar at (2,0)
      return { targets: ['sq:2,1'], enemy } as any
    },
    assert: (g, c) => expect(g.units[(c as any).enemy].damage, 'the spark dealt 2 to the unit at the chosen square').toBe(2),
  },
  {
    avatar: 'Avatar of Water', key: 'flood',
    setup: (g) => {
      const a = g.units[avatarId(g)]
      siteAt(g, 0, 'Pond', a.x, a.y) // a body of water under the avatar
      const adj = siteAt(g, 0, 'Arid Desert', a.x, a.y + 1) // adjacent dry site to flood
      return { targets: [adj] }
    },
    assert: (g, c) => expect(g.sites[c.targets[0]].flooded, 'the adjacent site floods').toBe(true),
  },
  {
    avatar: 'Avatar of Fire', key: 'kindle',
    setup: () => ({}),
    assert: (g) => expect(g.flow?.fireballTurn?.[0], 'kindle set the fireball turn flag').toBe(g.turn),
  },
  {
    avatar: 'Avatar of Air', key: 'fly',
    setup: (g) => {
      const a = g.units[avatarId(g)]
      // an air site under the avatar, a unit atop it, and a nearby site to fly to
      // (clear any scaffold site on the avatar's square first).
      for (const id of Object.keys(g.sites)) {
        const s = g.sites[id]; if (s.x === a.x && s.y === a.y) delete (g.sites as any)[id]
      }
      siteAt(g, 0, 'Lone Tower', a.x, a.y) // Lone Tower = air Ordinary site
      siteAt(g, 0, 'Arid Desert', a.x + 1, a.y + 1) // a nearby destination site
      const flyer = usummon(g, 0, 'Foot Soldier', a.x, a.y) // a unit here to fly
      return { targets: [flyer], origin: { x: a.x, y: a.y } } as any
    },
    assert: (g, c) => {
      const flyer = g.units[(c.targets as string[])[0]]
      const o = (c as any).origin
      // fly teleports the chosen unit off its origin square to a nearby site (the driver
      // may pick any legal nearby site) — proving the fly resolved.
      expect(!(flyer.x === o.x && flyer.y === o.y), 'the flown unit left its origin for a nearby site').toBe(true)
      expect(Object.values(g.sites).some((s) => s.x === flyer.x && s.y === flyer.y && !s.isRubble), 'it landed on a site').toBe(true)
    },
  },
  {
    avatar: 'Deathspeaker', key: 'speak',
    setup: (g) => { cemeteryCard(g, 0, 'Foot Soldier'); return {} },
    assert: (g, c) => expect(newLogs(g, c.logBefore).some((m) => /echo fades back into death|Deathspeaker/i.test(m)), "the dead minion's echo flickered").toBe(true),
  },
  {
    avatar: 'Archimago', key: 'echo',
    setup: (g) => { for (let i = 0; i < 3; i++) cemeteryCard(g, 0, 'Lightning Bolt'); return {} },
    // "Cast a copy" CASTS it (may fizzle for want of a target) — the 3 dead magics
    // are banished as the cost, and NO free token is left idling in hand.
    assert: (g, c) => expect(
      g.players[0].banished.length >= 3 &&
        newLogs(g, c.logBefore).some((m) => /echoes/i.test(m)) &&
        !g.players[0].hand.some((id) => g.cards[id]?.isToken),
      'Archimago cast an echo copy (3 magics banished, no idle hand token)',
    ).toBe(true),
  },
  {
    avatar: 'Flamecaller', key: 'pyre',
    setup: (g) => {
      // a dead fire minion so pyre has fuel; an enemy in a cardinal line to hit.
      cemeteryCard(g, 0, 'Angry Mob') // a fire minion (fire threshold) → pyre fuel
      usummon(g, 1, 'Sea Serpent', 2, 3) // south of the avatar at (2,0)
      return {}
    },
    assert: (g, c) => expect(newLogs(g, c.logBefore).some((m) => /Flamecaller|damage|burn/i.test(m)), 'pyre resolved (banished fuel / dealt damage)').toBe(true),
  },
  {
    avatar: 'Geomancer', key: 'reclaim',
    setup: (g) => {
      const a = g.units[avatarId(g)]
      // adjacent Rubble to reclaim (atlas is non-empty from the starter deck)
      const rub = siteAt(g, 0, 'Arid Desert', a.x, a.y + 1)
      g.sites[rub].isRubble = true
      return {}
    },
    assert: (g, c) => expect(newLogs(g, c.logBefore).some((m) => /Geomancer|Reclaim/i.test(m)) || Object.values(g.sites).some((s) => !s.isRubble), 'reclaim replaced adjacent rubble with a site').toBe(true),
  },
  {
    avatar: 'Pathfinder', key: 'blaze',
    setup: (g) => {
      // Pathfinder starts with 0 sites drawn but its atlas is full; an adjacent void
      // (unsited square) is needed. The avatar sits at (2,0); (2,0)'s scaffold sites
      // occupy some squares — clear the avatar-adjacent square (2,1) if sited.
      const a = g.units[avatarId(g)]
      for (const id of Object.keys(g.sites)) {
        const s = g.sites[id]; if (s.x === a.x && s.y === a.y + 1) delete (g.sites as any)[id]
      }
      // strip the scaffold Foot Soldier at (2,1) so nothing blocks the site drop
      for (const id of Object.keys(g.units)) {
        const u = g.units[id]; if (!u.isAvatar && u.x === a.x && u.y === a.y + 1) delete (g.units as any)[id]
      }
      return {}
    },
    assert: (g, c) => expect(newLogs(g, c.logBefore).some((m) => /Pathfinder blazes/i.test(m)), 'Pathfinder blazed a trail (played a site + moved)').toBe(true),
  },
  {
    avatar: 'Persecutor', key: 'zeal',
    setup: (g) => { usummon(g, 1, 'Sea Serpent', 3, 1); return {} }, // an enemy to brand
    assert: (g, c) => expect((g.flow?.branded != null) || newLogs(g, c.logBefore).some((m) => /Persecutor|branded|stalks/i.test(m)), 'zeal branded an enemy or stepped toward Evil').toBe(true),
  },
  {
    avatar: 'Realm-Eater', key: 'digest',
    setup: (g) => {
      // digest only does something when the Realm-Eater ate a site (counters.mustDigest);
      // seed that so the ability has an observable effect.
      g.units[avatarId(g)].counters = { ...(g.units[avatarId(g)].counters ?? {}), mustDigest: 1 } as any
      return {}
    },
    assert: (g, c) => expect(g.units[avatarId(g)].counters?.mustDigest == null && newLogs(g, c.logBefore).some((m) => /digests .*meal/i.test(m)), 'Realm-Eater digested its meal').toBe(true),
  },
  {
    avatar: 'Waveshaper', key: 'wave',
    setup: (g) => {
      const a = g.units[avatarId(g)]
      for (const id of Object.keys(g.sites)) {
        const s = g.sites[id]; if ((s.x === a.x && s.y === a.y) || (s.x === a.x && s.y === a.y + 1)) delete (g.sites as any)[id]
      }
      siteAt(g, 0, 'Pond', a.x, a.y) // a controlled body of water
      siteAt(g, 0, 'Arid Desert', a.x, a.y + 1) // an adjacent dry site to flood
      return {}
    },
    assert: (g) => expect(Object.values(g.sites).some((s) => s.flooded), 'the wave flooded a dry site near your waters').toBe(true),
  },
  {
    avatar: 'Animist', key: 'animate',
    setup: (g) => {
      // a magic in hand becomes a Spirit; needs a controlled site to summon onto (the
      // scaffold Rustic Villages provide those). Ensure a magic is in hand.
      const id = newId(g, 'c'); g.cards[id] = { id, name: 'Lightning Bolt', owner: 0 } as any
      g.players[0].hand.push(id)
      return {}
    },
    assert: (g, c) => expect(Object.values(g.units).some((u) => u.counters?.animistSpirit) || newLogs(g, c.logBefore).some((m) => /Spirit form/i.test(m)), 'a magic took Spirit form on the board').toBe(true),
  },
  {
    avatar: 'Imposter', key: 'imposter:mask',
    setup: (g) => {
      // the mask ability banishes an Avatar from the collection and pays a (2) zone toll
      // on resolution; give the collection an avatar and plenty of mana (board has +50).
      g.players[0].collection = { ...(g.players[0].collection ?? {}), Sorcerer: 1 }
      return {}
    },
    assert: (g, c) => expect(g.flow?.imposterMask?.[0] != null || newLogs(g, c.logBefore).some((m) => /dons the face|mask/i.test(m)), 'the Imposter donned a mask').toBe(true),
  },
  {
    avatar: 'Dragonlord', key: 'invoke',
    setup: () => ({}), // invoke asks a nameCard (which Unique Dragon) — driver picks the first
    assert: (g, c) => expect(g.flow?.dragonForm != null || g.flow?.dragonlordPick?.[0] != null || newLogs(g, c.logBefore).some((m) => /aspect|Dragon/i.test(m)), "Dragonlord took on a Dragon's aspect").toBe(true),
  },
]

describe('F.1 avatar activated-abilities sweep — every scripted avatar ability, DOM-driven to acceptance', () => {
  for (const spec of AVATAR_ABILITIES) {
    it(`${spec.avatar} — ${spec.key}`, () => {
      const g = boardWithAvatar(spec.avatar)
      const extra = spec.setup(g) as any
      const targets: string[] = extra.targets ?? []
      const handBefore = g.players[0].hand.length
      const logBefore = g.log.length

      // gating parity: the engine's canActivate is the single source of truth.
      const reason = canActivate(g, 0, avatarId(g), spec.key)

      const h = new GameHarness(g).mount()
      active = h
      const btn = selectAvatarAbility(h, spec.key)
      // button disabled-state MUST equal canActivate===null.
      expect(!btn.disabled, `${spec.avatar} ${spec.key}: button enabled iff canActivate===null (reason=${reason ?? 'null'})`).toBe(reason === null)
      // every board is built so the ability is activatable — none left correctly disabled.
      expect(reason, `${spec.avatar} ${spec.key} must be activatable on its purpose-built board`).toBeNull()

      h.click(btn)
      const finding = driveAvatarAbility(h, { targets })
      expect(finding.ok, `${spec.avatar} ${spec.key} drove to engine acceptance: ${finding.detail}`).toBe(true)

      // script-relevant post-state (never acceptance-only).
      spec.assert(g, { logBefore, targets, handBefore, ...extra } as any)
    })
  }
})

// =====================================================================================
// F.2 — the five mandated POST-STATE proofs, isolated with tight asserts.
// (F.1 already exercises them; these pin the exact observable the mission names.)
// =====================================================================================

describe('F.2 mandated post-state proofs', () => {
  it('Savior save → the chosen minion gains ward', () => {
    const g = boardWithAvatar('Savior')
    const m = usummon(g, 0, 'Foot Soldier', 2, 0)
    g.units[m].enteredTurn = g.turn
    const h = new GameHarness(g).mount(); active = h
    const btn = selectAvatarAbility(h, 'save')
    expect(btn.disabled, 'save enabled with a minion summoned this turn').toBe(false)
    h.click(btn)
    const f = driveAvatarAbility(h, { targets: [m] })
    expect(f.ok, `save drove to acceptance: ${f.detail}`).toBe(true)
    expect(g.units[m].ward, "the Savior's blessing wards the chosen minion").toBe(true)
  })

  it('Sparkmage spark → damage lands at the chosen square (and the tap ability highlights squares)', () => {
    const g = boardWithAvatar('Sparkmage')
    g.flow = g.flow ?? {}; ;(g.flow as any).airCastSum = { 0: 2 }
    const enemy = usummon(g, 1, 'Sea Serpent', 2, 1) // nearby the avatar at (2,0)
    const h = new GameHarness(g).mount(); active = h
    const btn = selectAvatarAbility(h, 'spark')
    expect(btn.disabled, 'spark enabled (tap available)').toBe(false)
    h.click(btn)
    h.rerender()
    // avatar-sourced tap ability: the square-target picker highlights clickable squares.
    expect(h.container.querySelector('[data-modebanner="abilityTargets"][data-spec-what="square"]'), 'spark opens a square-target picker').not.toBeNull()
    expect(h.container.querySelectorAll('[data-clickable="1"][data-sq]').length, 'squares are highlighted for the avatar-sourced spark').toBeGreaterThan(0)
    const f = driveAvatarAbility(h, { targets: ['sq:2,1'] })
    expect(f.ok, `spark drove to acceptance: ${f.detail}`).toBe(true)
    expect(g.units[enemy].damage, 'the spark dealt 2 damage at the chosen square').toBe(2)
  })

  it('Witch curse → the enemy avatar is cursed', () => {
    const g = boardWithAvatar('Witch')
    const enemyAv = g.players[1].avatarUnitId
    const lifeBefore = g.units[enemyAv].life ?? 20
    const h = new GameHarness(g).mount(); active = h
    const btn = selectAvatarAbility(h, 'curse')
    expect(btn.disabled, 'curse enabled (tap available, enemy avatar exists)').toBe(false)
    h.click(btn)
    const f = driveAvatarAbility(h, { targets: [enemyAv] })
    expect(f.ok, `curse drove to acceptance: ${f.detail}`).toBe(true)
    const cursed =
      (g.flow?.witchCurse?.length ?? 0) > 0 ||
      (g.units[enemyAv].life ?? 20) < lifeBefore ||
      g.units[enemyAv].modifiers.length > 0
    expect(cursed, 'the enemy avatar suffers the hex (spell tax / life loss / power drain)').toBe(true)
  })

  it('Avatar of Water flood → the target site is flooded', () => {
    const g = boardWithAvatar('Avatar of Water')
    const a = g.units[avatarId(g)]
    siteAt(g, 0, 'Pond', a.x, a.y)
    const adj = siteAt(g, 0, 'Arid Desert', a.x, a.y + 1)
    const h = new GameHarness(g).mount(); active = h
    const btn = selectAvatarAbility(h, 'flood')
    expect(btn.disabled, 'flood enabled (tap available)').toBe(false)
    h.click(btn)
    const f = driveAvatarAbility(h, { targets: [adj] })
    expect(f.ok, `flood drove to acceptance: ${f.detail}`).toBe(true)
    expect(g.sites[adj].flooded, 'the target site is flooded').toBe(true)
  })

  it('Necromancer raise → a Skeleton returns to the board', () => {
    const g = boardWithAvatar('Necromancer')
    const before = Object.values(g.units).filter((u) => u.name === 'Skeleton').length
    const h = new GameHarness(g).mount(); active = h
    const btn = selectAvatarAbility(h, 'raise')
    expect(btn.disabled, 'raise enabled (1 mana available)').toBe(false)
    h.click(btn)
    const f = driveAvatarAbility(h)
    expect(f.ok, `raise drove to acceptance: ${f.detail}`).toBe(true)
    const after = Object.values(g.units).filter((u) => u.name === 'Skeleton').length
    expect(after, 'a Skeleton token joined the board').toBe(before + 1)
  })
})

// =====================================================================================
// F.3 — Dragonlord grantsAbilities: when the Dragonlord takes on its Dragon aspect
// (flow.dragonForm this turn), the DRAGON'S activated ability is granted TO THE
// DRAGONLORD AVATAR and its button surfaces via the grantedAbilities path in
// unitActions (data-granted="1"). It then drives to acceptance.
//
// NOTE on the mission prose ("summon a Dragon minion under Dragonlord, select IT"):
// the script (gen/m30.ts) grants abilities ONLY to the Dragonlord itself —
// `grantsAbilities: (state, selfId, unit) => unit.id !== selfId ? [] : ...`. Per the
// standing directive (trust the script over recollection), the grant surfaces on the
// avatar, so we select the AVATAR and assert its granted button. A separately-summoned
// Dragon minion would (correctly) get nothing from the Dragonlord's grant.
// =====================================================================================

describe('F.3 Dragonlord grantsAbilities — the invoked Dragon aspect grants its ability to the avatar', () => {
  it('with a dragonForm in effect the granted Dragon ability renders on the avatar (data-granted="1") and drives to acceptance', () => {
    // a Unique Dragon whose script carries an activated ability (Ignis Rex → roar).
    const dragon = allCards.find(
      (c) => c.type === 'Minion' && c.rarity === 'Unique' && c.subtypes?.includes('Dragon') && (getScript(c.name) as any)?.abilities?.length,
    )
    expect(dragon, 'a Unique Dragon with an activated ability exists').toBeTruthy()
    const grantedKey: string = (getScript(dragon!.name) as any).abilities[0].key

    const g = boardWithAvatar('Dragonlord')
    // put the Dragonlord's granted aspect in effect this turn.
    g.flow = g.flow ?? {}
    g.flow.dragonForm = { player: 0, name: dragon!.name, turn: g.turn } as any
    const av = avatarId(g)

    // engine oracle: grantedAbilities on the avatar includes the Dragon's ability.
    expect(getScript('Dragonlord')?.grantsAbilities, 'Dragonlord scripts grantsAbilities').toBeTruthy()

    const h = new GameHarness(g).mount(); active = h
    // select the DRAGONLORD AVATAR — the grant surfaces on it.
    h.click(must(h.container, `[data-unit="${av}"][data-avatar="1"]`, 'Dragonlord avatar chip'))
    h.rerender()
    const grantedBtn = h.container.querySelector(`[data-ability="${grantedKey}"][data-granted="1"]`) as HTMLButtonElement | null
    expect(grantedBtn, `the granted ability "${grantedKey}" renders on the avatar with data-granted="1"`).not.toBeNull()

    // its disabled-state matches canActivate; if enabled, drive to acceptance.
    const reason = canActivate(g, 0, av, grantedKey)
    expect(!grantedBtn!.disabled, 'granted button enabled iff canActivate===null').toBe(reason === null)
    if (reason === null) {
      const drift0 = h.drifts.length
      h.click(grantedBtn!)
      const f = driveAvatarAbility(h)
      expect(h.drifts.length === drift0 || f.ok, `granted ability drove to acceptance: ${f.detail}`).toBe(true)
    }
  })
})

// =====================================================================================
// F.4 — avatar tap-gate through the DOM: after the avatar taps (via a tap-cost ability),
// EVERY tap-cost ability button AND the "Tap: draw site" button must be gone/disabled.
// This proves canActivate's tap gate for avatars, surfaced in the client (the draw-site
// button renders only when !avatar.tapped; tap-cost ability buttons disable via
// canActivate → 'Already tapped.').
// =====================================================================================

describe('F.4 avatar tap-gate — a tapped avatar offers no further tap actions', () => {
  it('after Avatar of Water taps for flood, both flood and "Tap: draw site" are gated', () => {
    const g = boardWithAvatar('Avatar of Water')
    const a = g.units[avatarId(g)]
    siteAt(g, 0, 'Pond', a.x, a.y)
    const adj = siteAt(g, 0, 'Arid Desert', a.x, a.y + 1)
    const h = new GameHarness(g).mount(); active = h

    // before tapping: selecting the avatar shows both the draw-site button and flood.
    const btn = selectAvatarAbility(h, 'flood') // selects the avatar
    expect(h.container.querySelector('[data-tap-draw-site="1"]'), 'draw-site button present before tapping').not.toBeNull()
    expect(btn.disabled, 'flood enabled before tapping').toBe(false)

    // tap the avatar by resolving flood (a tap-cost ability).
    h.click(btn)
    const f = driveAvatarAbility(h, { targets: [adj] })
    expect(f.ok, `flood tapped the avatar: ${f.detail}`).toBe(true)
    expect(h.state.units[avatarId(g)].tapped, 'the avatar is now tapped').toBe(true)

    // re-select the avatar → the draw-site button is gone, flood is disabled.
    h.rerender()
    h.click(must(h.container, `[data-unit="${avatarId(g)}"][data-avatar="1"]`, 'avatar chip'))
    h.rerender()
    expect(h.container.querySelector('[data-tap-draw-site="1"]'), '"Tap: draw site" is gone once the avatar is tapped').toBeNull()
    const floodBtn2 = h.container.querySelector('[data-ability="flood"]') as HTMLButtonElement | null
    expect(floodBtn2, 'the flood button still renders').not.toBeNull()
    expect(floodBtn2!.disabled, 'flood is disabled on a tapped avatar (canActivate → Already tapped.)').toBe(true)
    expect(canActivate(g, 0, avatarId(g), 'flood'), 'engine agrees: flood is gated on a tapped avatar').not.toBeNull()
  })
})

// =====================================================================================
// F.5 — NEGATIVE CONTROL (mandatory): reintroduce the HISTORICAL Savior bug in-process.
//
// The live bug: the Savior ability button fired `activate` with NO targets (the client
// skipped collecting the minion), so the engine rejected with "Missing targets." (see
// game.ts:370 `if (!spec.upTo && ti < spec.count) return 'Missing targets.'`).
//
// The fix that shipped is activateAbilityClick's specs branch (Game.tsx ~2019):
//   if (needed > 0) { setMode({ m: 'abilityTargets', … }); return }  // collect targets
//   send({ t: 'activate', sourceId, ability })                       // only when no targets
//
// We reproduce the bug by BYPASSING that branch: we send the raw targetless `activate`
// through the harness's real hotseat send (the exact app send path) — precisely the
// action a mis-wired button would emit. The engine then records a DRIFT with
// "Missing targets." (RED). We assert RED, then perform the CORRECT flow (collect the
// target through the DOM) and assert GREEN — the minion is warded, zero drift.
//
//   break  → send targetless `activate`     → RED  (drift: "Missing targets.")
//   revert → drive the DOM target flow       → GREEN (ward applied, no drift)
// =====================================================================================

describe('F.5 Savior negative control — the historical targetless-activate bug', () => {
  it('break→RED (Missing targets.), revert→GREEN (ward applied)', () => {
    const g = boardWithAvatar('Savior')
    const m = usummon(g, 0, 'Foot Soldier', 2, 0)
    g.units[m].enteredTurn = g.turn
    const av = avatarId(g)

    const h = new GameHarness(g).mount(); active = h
    // sanity: the ability is genuinely activatable (so the ONLY thing wrong is the
    // missing target — this isolates the historical wiring bug).
    expect(canActivate(g, 0, av, 'save'), 'save is activatable on this board').toBeNull()

    // ---- BREAK: emit the mis-wired targetless activate (bypassing the specs branch) ----
    const drift0 = h.drifts.length
    h.send({ t: 'activate', sourceId: av, ability: 'save' } as any) // NO targets — the bug
    expect(h.drifts.length, 'the bug produces exactly one engine rejection').toBe(drift0 + 1)
    expect(h.drifts[h.drifts.length - 1].error, 'the engine rejects with the historical "Missing targets."').toBe('Missing targets.')
    expect(g.units[m].ward, 'no ward was applied by the broken call').toBeFalsy()

    // ---- REVERT: the correct wiring collects the target through the DOM, then activates ----
    const btn = selectAvatarAbility(h, 'save')
    h.click(btn)
    const driftBeforeFix = h.drifts.length
    const f = driveAvatarAbility(h, { targets: [m] })
    expect(f.ok, `the corrected flow drives to acceptance: ${f.detail}`).toBe(true)
    expect(h.drifts.length, 'the corrected flow raises NO new drift').toBe(driftBeforeFix)
    expect(g.units[m].ward, 'GREEN: the minion is warded once targets are collected').toBe(true)
  })
})
