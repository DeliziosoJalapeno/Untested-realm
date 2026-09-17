// Bone Jumble's "(1), Sacrifice a Skeleton token → Summon Bone Jumble from your cemetery there"
// now lives on the CARD as a from-cemetery ability (not only as a Skeleton-token grant). So:
//  1. you can activate it straight from Bone Jumble in the grave (pick a Skeleton to sacrifice),
//  2. clicking a Skeleton token still offers the raise, and
//  3. Vivien copies it: with a spellcaster Bone Jumble in the realm, a dead Vivien is raised by
//     sacrificing a Skeleton — her self-reference resolves to HER card.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveMana } from './helpers'
import { grantedAbilities, applyAction, type GameState } from '../src'
import '../src/cards/scripts/index'

function cemeteryCard(g: GameState, player: 0 | 1, name: string): string {
  const id = `cc${g.nextId++}`
  g.cards[id] = { id, name, owner: player } as any
  g.players[player].cemetery.push(id)
  return id
}
const spellcaster = (g: GameState, u: { modifiers: any[] }) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'spellcaster', duration: 'permanent', turn: g.turn, sourcePlayer: 0 } as any)

describe('Bone Jumble from-cemetery raise + Vivien copy', () => {
  it('the bone-raiser offers its OWN cemetery ability: sacrifice a Skeleton, summon it there', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 5)
    placeSite(g, 0, 'Spire', 1, 1)
    summonCard(g, 0, 'Skeleton', 1, 1)
    const bj = cemeteryCard(g, 0, 'Bone Jumble')

    const avatar = g.units[g.players[0].avatarUnitId]
    const ab = grantedAbilities(g, avatar).find((a) => a.key === `boneRaise:${bj}`)
    expect(ab, 'Bone Jumble in the grave offers its raise on the avatar').toBeTruthy()
    expect(ab!.available!(g, avatar.id), 'available while a Skeleton stands on a site').toBe(true)

    const manaBefore = g.players[0].mana
    const res = applyAction(g, 0, { t: 'activate', sourceId: avatar.id, ability: ab!.key } as any)
    expect(res.ok, res.ok ? '' : (res as any).error).toBe(true)
    expect(g.players[0].cemetery.includes(bj), 'Bone Jumble left the cemetery').toBe(false)
    expect(Object.values(g.units).some((u) => u.name === 'Bone Jumble' && u.x === 1 && u.y === 1), 'Bone Jumble rises where the Skeleton stood').toBe(true)
    expect(Object.values(g.units).some((u) => u.name === 'Skeleton'), 'the Skeleton was sacrificed').toBe(false)
    expect(g.players[0].mana, 'paid 1 mana').toBe(manaBefore - 1)
  })

  it('no Skeleton to sacrifice → the ability is unavailable (mana is never wasted)', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 5)
    placeSite(g, 0, 'Spire', 1, 1)
    const bj = cemeteryCard(g, 0, 'Bone Jumble')
    const avatar = g.units[g.players[0].avatarUnitId]
    const ab = grantedAbilities(g, avatar).find((a) => a.key === `boneRaise:${bj}`)!
    expect(ab.available!(g, avatar.id)).toBe(false)
    const res = applyAction(g, 0, { t: 'activate', sourceId: avatar.id, ability: ab.key } as any)
    expect(res.ok, 'rejected — no Skeleton').toBe(false)
  })

  it('the Skeleton token still grants the raise (click the Skeleton to sacrifice it)', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 5)
    placeSite(g, 0, 'Spire', 2, 2)
    const sk = summonCard(g, 0, 'Skeleton', 2, 2); sk.enteredTurn = -1
    const bj = cemeteryCard(g, 0, 'Bone Jumble')

    const ab = grantedAbilities(g, sk).find((a) => a.key === `bones:${bj}`)
    expect(ab, 'the Skeleton lists a raise for the cemetery Bone Jumble').toBeTruthy()
    const res = applyAction(g, 0, { t: 'activate', sourceId: sk.id, ability: ab!.key } as any)
    expect(res.ok, res.ok ? '' : (res as any).error).toBe(true)
    expect(Object.values(g.units).some((u) => u.name === 'Bone Jumble' && u.x === 2 && u.y === 2)).toBe(true)
    expect(g.units[sk.id], 'Skeleton sacrificed').toBeUndefined()
  })

  it('Vivien copies it: a spellcaster Bone Jumble in the realm lets a dead Vivien be raised by a Skeleton', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 5)
    placeSite(g, 0, 'Spire', 1, 1)
    placeSite(g, 0, 'Spire', 3, 3)
    const bjRealm = summonCard(g, 0, 'Bone Jumble', 3, 3); spellcaster(g, bjRealm) // realm spellcaster source
    summonCard(g, 0, 'Skeleton', 1, 1)
    const viv = cemeteryCard(g, 0, 'Vivien the Enchantress')

    const avatar = g.units[g.players[0].avatarUnitId]
    const ab = grantedAbilities(g, avatar).find((a) => a.key === `boneRaise:${viv}`)
    expect(ab, 'Vivien in the grave offers the copied bone-raise').toBeTruthy()

    const res = applyAction(g, 0, { t: 'activate', sourceId: avatar.id, ability: ab!.key } as any)
    expect(res.ok, res.ok ? '' : (res as any).error).toBe(true)
    expect(g.players[0].cemetery.includes(viv), 'Vivien left the cemetery').toBe(false)
    expect(Object.values(g.units).some((u) => u.name === 'Vivien the Enchantress' && u.x === 1 && u.y === 1), 'Vivien rises where the Skeleton stood — self-reference resolved to HER').toBe(true)
  })

  it('the Skeleton token also offers to raise a copying Vivien', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 5)
    placeSite(g, 0, 'Spire', 1, 1)
    placeSite(g, 0, 'Spire', 3, 3)
    const bjRealm = summonCard(g, 0, 'Bone Jumble', 3, 3); spellcaster(g, bjRealm)
    const sk = summonCard(g, 0, 'Skeleton', 1, 1); sk.enteredTurn = -1
    const viv = cemeteryCard(g, 0, 'Vivien the Enchantress')

    const ab = grantedAbilities(g, sk).find((a) => a.key === `bones:${viv}`)
    expect(ab, 'the Skeleton lists a raise for the copying Vivien').toBeTruthy()
    const res = applyAction(g, 0, { t: 'activate', sourceId: sk.id, ability: ab!.key } as any)
    expect(res.ok, res.ok ? '' : (res as any).error).toBe(true)
    expect(Object.values(g.units).some((u) => u.name === 'Vivien the Enchantress' && u.x === 1 && u.y === 1)).toBe(true)
  })
})
