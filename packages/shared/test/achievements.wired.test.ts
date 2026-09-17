// The card-script-driven achievements (awardAchievement) — feats a pure state diff can't see.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { applyAchievements, applyJudge, makeCtx, getScript, avatarOf, siteAt, isDisabled, type GameState } from '../src'

const clone = (g: GameState): GameState => JSON.parse(JSON.stringify(g))
const has = (g: GameState, id: string, seat: number) =>
  ((g.flow?.achievements ?? []) as { id: string; seat: number }[]).some((u) => u.id === id && u.seat === seat)

describe('wired achievements', () => {
  it('promotion-denied: an effect-summoned Mephistopheles never took over the Avatar', () => {
    const g = newGame(); keepBoth(g)
    const prev = clone(g)
    // effect-summon (no cast) → the takeover castRider never runs → he stays a plain minion
    applyJudge(g, 0, { k: 'summonUnit', name: 'Mephistopheles', player: 0, x: 1, y: 1, region: 'surface', noGenesis: true })
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    expect(has(g, 'promotion-denied', 0)).toBe(true)
  })

  it('jesus-evil-twin: an Evil Twin copies Faith Incarnate', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 1, { k: 'summonUnit', name: 'Faith Incarnate', player: 1, x: 3, y: 2, region: 'surface', noGenesis: true })
    applyJudge(g, 0, { k: 'summonUnit', name: 'Evil Twin', player: 0, x: 2, y: 2, region: 'surface', noGenesis: true })
    const faith = Object.values(g.units).find((u) => u.name === 'Faith Incarnate')!
    const twin = Object.values(g.units).find((u) => u.name === 'Evil Twin')!
    getScript('Evil Twin')!.genesis!(makeCtx(g as GameState, twin.id, 0, [{ unit: faith.id }]))
    expect(has(g, 'jesus-evil-twin', 0)).toBe(true)
  })

  it('cleanse-with-fire: Vesuvius erupts onto the enemy Avatar', () => {
    const g = newGame(); keepBoth(g)
    const foe = avatarOf(g, 1)
    // ensure the enemy Avatar stands on a site, and place Vesuvius on an adjacent site
    if (!siteAt(g, foe.x, foe.y)) applyJudge(g, 0, { k: 'placeSite', name: 'Accursed Tower', player: 1, x: foe.x, y: foe.y })
    const vx = foe.x > 0 ? foe.x - 1 : foe.x + 1
    applyJudge(g, 0, { k: 'placeSite', name: 'Vesuvius', player: 0, x: vx, y: foe.y })
    const ves = Object.values(g.sites).find((s) => s.name === 'Vesuvius')!
    getScript('Vesuvius')!.abilities![0].effect(makeCtx(g as GameState, ves.id, 0, []))
    expect(has(g, 'cleanse-with-fire', 0)).toBe(true)
  })

  it('court-too: Overflowing Court disables a Court minion (Seelie Court)', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 1, { k: 'summonUnit', name: 'Seelie Court', player: 1, x: 3, y: 2, region: 'surface', noGenesis: true })
    const seelie = Object.values(g.units).find((u) => u.name === 'Seelie Court')!
    expect(isDisabled(g as GameState, g.units[seelie.id])).toBe(false)
    applyJudge(g, 0, { k: 'placeSite', name: 'Overflowing Court', player: 0, x: 1, y: 1 })
    const site = Object.values(g.sites).find((s) => s.name === 'Overflowing Court')!
    getScript('Overflowing Court')!.genesis!(makeCtx(g as GameState, site.id, 0, []))
    expect(has(g, 'court-too', 0)).toBe(true)
    expect(isDisabled(g as GameState, g.units[seelie.id])).toBe(true) // the engine bug fix
  })

  it('man-eater-bug: a flipped Vivien is a useless card on the field', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'summonUnit', name: 'Vivien the Enchantress', player: 0, x: 2, y: 2, region: 'surface', noGenesis: true })
    const viv = Object.values(g.units).find((u) => u.name === 'Vivien the Enchantress')!
    const prev = clone(g)
    g.units[viv.id].flipped = true // as the copied Druid 'bruin' flip would do to her
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    expect(has(g, 'man-eater-bug', 0)).toBe(true)
  })

  it('zombie-vivien: a dead Vivien copying a bone-raiser raises herself with a Skeleton', () => {
    const g = newGame(); keepBoth(g)
    // a SPELLCASTER bone-raiser in the realm → a dead Vivien copies its cemetery raise
    applyJudge(g, 0, { k: 'summonUnit', name: 'Bone Jumble', player: 0, x: 0, y: 0, region: 'surface', noGenesis: true })
    const bj = Object.values(g.units).find((u) => u.name === 'Bone Jumble')!
    applyJudge(g, 0, { k: 'keyword', unitId: bj.id, keyword: 'spellcaster', duration: 'permanent' })
    applyJudge(g, 0, { k: 'addToCemetery', name: 'Vivien the Enchantress', player: 0 })
    applyJudge(g, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x: 2, y: 2 })
    applyJudge(g, 0, { k: 'token', name: 'Skeleton', player: 0, x: 2, y: 2, region: 'surface' })
    const sk = Object.values(g.units).find((u) => u.name === 'Skeleton')!
    const raise = getScript('Skeleton')!.grantsAbilities!(g as GameState, sk.id, g.units[sk.id]).find((a) => a.key.startsWith('bones:'))
    expect(raise, 'the Skeleton offers to raise the copying Vivien').toBeTruthy()
    raise!.effect!(makeCtx(g as GameState, sk.id, 0, []))
    expect(has(g, 'zombie-vivien', 0)).toBe(true)
    expect(Object.values(g.units).some((u) => u.name === 'Vivien the Enchantress')).toBe(true) // she's back
  })

  // ── batch 2 ──
  it('amelia-witch: a Broomstick Witch on top of the Vesuvius', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'placeSite', name: 'Vesuvius', player: 0, x: 2, y: 2 })
    applyJudge(g, 0, { k: 'summonUnit', name: 'Broomstick Witch', player: 0, x: 2, y: 2, region: 'surface', noGenesis: true })
    const prev = clone(g)
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    expect(has(g, 'amelia-witch', 0)).toBe(true)
  })

  it('flat-earther: destroy the Magellan Globe', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'spawnArtifact', name: 'Magellan Globe', player: 0, x: 1, y: 1 })
    const globe = Object.values(g.artifacts).find((a) => a.name === 'Magellan Globe')!
    const prev = clone(g)
    applyJudge(g, 0, { k: 'removeArtifact', artifactId: globe.id })
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    expect(has(g, 'flat-earther', 0)).toBe(true)
  })

  it('long-lost-brother: an Evil Twin copies Brother Knight', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 1, { k: 'summonUnit', name: 'Brother Knight', player: 1, x: 3, y: 2, region: 'surface', noGenesis: true })
    applyJudge(g, 0, { k: 'summonUnit', name: 'Evil Twin', player: 0, x: 2, y: 2, region: 'surface', noGenesis: true })
    const bro = Object.values(g.units).find((u) => u.name === 'Brother Knight')!
    const twin = Object.values(g.units).find((u) => u.name === 'Evil Twin')!
    getScript('Evil Twin')!.genesis!(makeCtx(g as GameState, twin.id, 0, [{ unit: bro.id }]))
    expect(has(g, 'long-lost-brother', 0)).toBe(true)
  })

  it('proper-use: crack the Bull Whip at the Bull Demons of Adum', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'spawnArtifact', name: 'Bull Whip', player: 0, x: 1, y: 1 })
    applyJudge(g, 1, { k: 'summonUnit', name: 'Bull Demons of Adum', player: 1, x: 2, y: 1, region: 'surface', noGenesis: true })
    const whip = Object.values(g.artifacts).find((a) => a.name === 'Bull Whip')!
    const demon = Object.values(g.units).find((u) => u.name === 'Bull Demons of Adum')!
    getScript('Bull Whip')!.abilities![0].effect(makeCtx(g as GameState, whip.id, 0, [{ unit: demon.id }]))
    expect(has(g, 'proper-use', 0)).toBe(true)
  })

  it('kinky-mf: a Daperyll Vampire wields the Bull Whip', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'summonUnit', name: 'Daperyll Vampire', player: 0, x: 1, y: 1, region: 'surface', noGenesis: true })
    const vamp = Object.values(g.units).find((u) => u.name === 'Daperyll Vampire')!
    applyJudge(g, 0, { k: 'spawnArtifact', name: 'Bull Whip', player: 0, x: 1, y: 1, giveTo: vamp.id })
    applyJudge(g, 1, { k: 'summonUnit', name: 'Bone Jumble', player: 1, x: 2, y: 1, region: 'surface', noGenesis: true })
    const whip = Object.values(g.artifacts).find((a) => a.name === 'Bull Whip')!
    const target = Object.values(g.units).find((u) => u.name === 'Bone Jumble')!
    getScript('Bull Whip')!.abilities![0].effect(makeCtx(g as GameState, whip.id, 0, [{ unit: target.id }]))
    expect(has(g, 'kinky-mf', 0)).toBe(true)
  })
})
