// THEIRS_12H.md #49–#60.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, castMagic, waiveThreshold, act, answer, settlePrompts, injectToHand } from './helpers'
import { avatarOf, checkStateBased, legalStepsFrom, type GameState } from '../src'
import '../src/cards/scripts/index'

function game(): GameState {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  for (const s of Object.values(g.sites)) delete g.sites[s.id]
  return g
}
const sites = (g: GameState, p: 0 | 1, ...sq: [number, number][]) => { for (const [x, y] of sq) placeSite(g, p, 'Rustic Village', x, y) }

describe('12H #49 Harpyon Urge strikes only on arrival', () => {
  function board(hollows: boolean) {
    const g = game()
    sites(g, 0, [1, 1]); placeSite(g, 1, hollows ? 'Gnome Hollows' : 'Fertile Earth', 3, 2)
    const ap = summonCard(g, 0, 'Apostles of Thamariel', 1, 1)
    const ex = summonCard(g, 1, 'Arjaro Exorcist', 3, 2)
    castMagic(g, 0, 'Harpyon Urge', { targets: [ap.id, ex.id] })
    settlePrompts(g)
    return { g, ap, ex }
  }
  it('blocked by Gnome Hollows: no arrival, no strike', () => {
    const { g, ap, ex } = board(true)
    expect([g.units[ap.id].x, g.units[ap.id].y]).toEqual([1, 1])
    expect(g.units[ex.id]?.damage).toBe(0)
  })
  it('control: on a plain site it flies and kills', () => {
    const { g, ex } = board(false)
    expect(g.units[ex.id]).toBeUndefined()
  })
})

describe('12H #50 Hellstar and Lumbering Giant can\'t defend even on the attacked square', () => {
  for (const name of ['Hellstar', 'Lumbering Giant']) {
    it(`${name} is not offered`, () => {
      const g = game()
      sites(g, 0, [1, 1]); sites(g, 1, [1, 2])
      const wolves = summonCard(g, 0, 'Grey Wolves', 1, 1)
      const foe = summonCard(g, 1, 'Grey Wolves', 1, 2)
      const big = summonCard(g, 1, name, 1, 2)
      act(g, 0, { t: 'moveAttack', unitId: wolves.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: foe.id } })
      const defend = g.prompts.find((p) => p.kind === 'defend')
      expect(((defend?.data?.candidates ?? []) as string[]).includes(big.id)).toBe(false)
    })
  }
})

describe('12H #51 Hounds of Ondaros only see Stealth in their own region', () => {
  it('Hounds underground leave the surface Poachers stealthed', () => {
    const g = game()
    sites(g, 0, [1, 1])
    const po = summonCard(g, 1, 'Kingswood Poachers', 1, 1); po.stealth = true
    summonCard(g, 0, 'Hounds of Ondaros', 1, 1, 'underground')
    checkStateBased(g)
    expect(g.units[po.id].stealth).toBe(true)
  })
})

describe('12H #52 Infernal Legion\'s damage is one simultaneous event', () => {
  it('Lamorak\'s Deathrite strike finds the Paladins unwarded and kills them', () => {
    const g = game()
    placeSite(g, 0, 'Stream', 1, 1); sites(g, 0, [1, 2])
    summonCard(g, 0, 'Infernal Legion', 1, 1)
    const lam = summonCard(g, 0, 'Sir Lamorak', 1, 2); lam.tapped = true
    const pal = summonCard(g, 1, 'Paladins of Bazia', 1, 2); pal.tapped = true; pal.ward = true
    act(g, 0, { t: 'endTurn' }); settlePrompts(g)
    expect(g.units[lam.id]).toBeUndefined()
    expect(g.units[pal.id]).toBeUndefined()
  })
})

describe('12H #53 Infiltrate can\'t give Monks of Kobalsa Stealth or control', () => {
  it('they are only tapped', () => {
    const g = game()
    sites(g, 0, [1, 1])
    const monks = summonCard(g, 1, 'Monks of Kobalsa', 1, 1)
    castMagic(g, 0, 'Infiltrate', { targets: [monks.id] })
    settlePrompts(g)
    expect(g.units[monks.id].tapped).toBe(true)
    expect(g.units[monks.id].stealth).toBeFalsy()
    expect(g.units[monks.id].controller).toBe(1)
  })
})

describe('12H #54 Innsmouth Dock lures an underwater neighbour into its own underwater', () => {
  it('the Worm steps underwater into the Dock', () => {
    const g = game()
    const dock = placeSite(g, 0, 'Innsmouth Dock', 1, 1); placeSite(g, 0, 'Thin Ice', 1, 2)
    const worm = summonCard(g, 0, 'Mester Stoor Worm', 1, 2, 'underwater')
    act(g, 0, { t: 'activate', sourceId: dock.id, ability: 'lure', targets: [worm.id] })
    settlePrompts(g)
    const w = g.units[worm.id]
    expect([w.x, w.y, w.region]).toEqual([1, 1, 'underwater'])
  })
})

describe('12H #55 King Arthur stops control changes', () => {
  it('Love Potion gains nothing while King Arthur is in the realm', () => {
    const g = game()
    sites(g, 0, [1, 1], [2, 1])
    const cher = summonCard(g, 0, 'Cherubim', 1, 1)
    const potion = giveArtifact(g, cher, 'Love Potion')
    const troll = summonCard(g, 1, 'Bosk Troll', 1, 1)
    summonCard(g, 1, 'King Arthur', 2, 1)
    act(g, 0, { t: 'activate', sourceId: potion.id, ability: 'potion', targets: [troll.id] })
    settlePrompts(g)
    expect(g.units[troll.id].controller).toBe(1)
  })
  it('Infiltrate gives Stealth and taps, but no control', () => {
    const g = game()
    sites(g, 0, [1, 1], [2, 1])
    summonCard(g, 0, 'King Arthur', 2, 1)
    const mut = summonCard(g, 1, 'Slimy Mutants', 1, 1)
    castMagic(g, 0, 'Infiltrate', { targets: [mut.id] })
    settlePrompts(g)
    expect(g.units[mut.id].controller).toBe(1)
    expect(g.units[mut.id].tapped).toBe(true)
  })
})

describe('12H #56 Leadworks silencing an enemy Vindictive Nation still triggers it', () => {
  it('you lose 1 for the Nation and 1 for the Lone Tower', () => {
    const g = game()
    const av = avatarOf(g, 0); av.x = 0; av.y = 1; av.tapped = false
    placeSite(g, 0, 'Wuthering Heights', 0, 1); placeSite(g, 0, 'Wuthering Heights', 0, 2)
    placeSite(g, 1, 'Vindictive Nation', 2, 2); placeSite(g, 1, 'Lone Tower', 2, 1)
    const life = av.life!
    const cid = injectToHand(g, 0, 'Leadworks')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: cid, x: 1, y: 1 })
    settlePrompts(g)
    expect(Object.values(g.sites).some((s) => s.name === 'Leadworks')).toBe(true)
    expect(avatarOf(g, 0).life).toBe(life - 2)
  })
})

describe('12H #57 Locusts of Illyria may copy onto their own square', () => {
  it('the own square is offered', () => {
    const g = game()
    placeSite(g, 0, 'Gothic Tower', 1, 1); sites(g, 0, [1, 2], [2, 1])
    summonCard(g, 0, 'Locusts of Illyria', 1, 1)
    act(g, 0, { t: 'endTurn' })
    const p = g.prompts.find((q) => q.kind === 'chooseSquare')
    const sq = ((p?.data?.squares ?? []) as { x: number; y: number }[]).map((s) => `${s.x},${s.y}`)
    expect(sq).toContain('1,1')
  })
})

describe('12H #58 Lord of Fear: a lone defender can\'t take the attacked unit out', () => {
  it('the Bodach stays in the fight', () => {
    const g = game()
    sites(g, 0, [1, 0], [1, 1], [1, 2])
    const lord = summonCard(g, 0, 'Lord of Fear', 1, 0)
    const bod = summonCard(g, 1, 'Bodach Bogeyman', 1, 1)
    const monks = summonCard(g, 1, 'Monks of Kobalsa', 1, 2)
    act(g, 0, { t: 'moveAttack', unitId: lord.id, path: [{ x: 1, y: 1, region: 'surface' }], attack: { unit: bod.id } })
    expect(g.prompts[0]?.kind).toBe('defend')
    answer(g, [monks.id])
    if (g.prompts[0]?.kind === 'stayInFight') answer(g, false)
    settlePrompts(g)
    // the Bodach stayed and struck too: Monks 4 + Bodach 4 kill the 6-power Lord (the Monks alone wouldn't)
    expect(g.units[lord.id], 'the Bodach fought beside the Monks').toBeUndefined()
  })
})

describe('12H #59 Magellan Globe wraps void and underground steps too', () => {
  it('a Voidwalk Ophanim may step into the void across the edge', () => {
    const g = game()
    sites(g, 0, [0, 1])
    const oph = summonCard(g, 0, 'Ophanim', 0, 1)
    giveArtifact(g, oph, 'Magellan Globe')
    const steps = legalStepsFrom(g, oph, { x: 0, y: 1, region: 'surface' }).map((s) => `${s.x},${s.y},${s.region}`)
    expect(steps).toContain('4,1,void')
  })
  it('a burrowed Root Spider may step underground across the edge', () => {
    const g = game()
    sites(g, 0, [1, 0], [1, 3])
    const spider = summonCard(g, 0, 'Root Spider', 1, 0, 'underground')
    const globe = summonCard(g, 0, 'Bosk Troll', 1, 3); giveArtifact(g, globe, 'Magellan Globe')
    const steps = legalStepsFrom(g, spider, { x: 1, y: 0, region: 'underground' }).map((s) => `${s.x},${s.y},${s.region}`)
    expect(steps).toContain('1,3,underground')
  })
})

describe('12H #60 Mariner\'s Curse can\'t submerge Old Salt Anchorman', () => {
  it('the Anchorman stays on the surface, alive', () => {
    const g = game()
    sites(g, 1, [1, 1]); placeSite(g, 1, 'Tintagel', 1, 2)
    const anchor = summonCard(g, 0, 'Old Salt Anchorman', 1, 1)
    g.cards.cmc = { id: 'cmc', name: "Mariner's Curse", owner: 1 } as any
    g.auras.amc = { id: 'amc', cardId: 'cmc', name: "Mariner's Curse", controller: 1, owner: 1, squares: [{ x: 1, y: 2 }], anchor: { x: 1, y: 2 } } as any
    act(g, 0, { t: 'moveAttack', unitId: anchor.id, path: [{ x: 1, y: 2, region: 'surface' }] })
    settlePrompts(g)
    expect(g.units[anchor.id]?.region).toBe('surface')
  })
})
