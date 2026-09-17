import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, placeSite, summonCard } from './helpers'
import { canActivate, getScript, makeCtx, effKeywords } from '../src'

const digestDef = () => getScript('Realm-Eater')!.abilities!.find((a) => a.key === 'digest')!

describe('Realm-Eater — Digest ability', () => {
  it('is unavailable with no meal, then available with a remaining-count label after devouring sites', () => {
    const g = newGame(); keepBoth(g)
    const eater = summonCard(g, 0, 'Realm-Eater', 2, 2)
    eater.enteredTurn = -1 // clear summoning sickness so the tap cost isn't the blocker
    const digest = digestDef()

    // nothing to digest → hidden (available=false) and rejected by canActivate
    expect(digest.available!(g, eater.id)).toBe(false)
    expect(canActivate(g, 0, eater.id, 'digest')).not.toBeNull()

    // devour two sites — onStrikeSite stacks the digest count
    const s1 = placeSite(g, 1, 'Spire', 2, 3)
    const s2 = placeSite(g, 1, 'Spire', 3, 2)
    getScript('Realm-Eater')!.onStrikeSite!(makeCtx(g, eater.id, 0, []), s1.id)
    getScript('Realm-Eater')!.onStrikeSite!(makeCtx(g, eater.id, 0, []), s2.id)

    expect(eater.counters?.mustDigest).toBe(2)
    expect(effKeywords(g, eater).immobile).toBeTruthy() // gorged → immobile
    expect(digest.available!(g, eater.id)).toBe(true)
    expect(digest.dynamicLabel!(g, eater.id)).toBe('Tap → Digest the eaten site (2)')
    expect(canActivate(g, 0, eater.id, 'digest')).toBeNull()
  })

  it('each digest lowers the count and the label; empties out and becomes mobile again', () => {
    const g = newGame(); keepBoth(g)
    const eater = summonCard(g, 0, 'Realm-Eater', 2, 2)
    eater.enteredTurn = -1
    eater.counters = { mustDigest: 2 }
    const digest = digestDef()

    act(g, 0, { t: 'activate', sourceId: eater.id, ability: 'digest' })
    expect(eater.counters?.mustDigest).toBe(1)
    expect(digest.dynamicLabel!(g, eater.id)).toBe('Tap → Digest the eaten site (1)')
    expect(effKeywords(g, eater).immobile).toBeTruthy() // still one meal churning

    eater.tapped = false // untap to digest the last one
    act(g, 0, { t: 'activate', sourceId: eater.id, ability: 'digest' })
    expect(eater.counters?.mustDigest ?? 0).toBe(0)
    expect(effKeywords(g, eater).immobile).toBeFalsy() // done → mobile
    expect(digest.available!(g, eater.id)).toBe(false)
  })
})
