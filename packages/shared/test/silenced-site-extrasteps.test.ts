// A silenced site loses its abilities, including step-granting ones (Astral Alcazar, Secret Tunnel).
// extraStepsFor always honoured that, but isLegalStep's precomputed StepCtx.siteGranters didn't, so a
// silenced Alcazar still let a step through when it was tested directly.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { isLegalStep, reachableLocations, siteSilenced, type GameState, type Step } from '../src'
import '../src/cards/scripts/index'

const voidSq: Step = { x: 0, y: 2, region: 'void' }
const alcazarSq: Step = { x: 3, y: 2, region: 'surface' }

function setup() {
  const g = newGame(42, 0) as GameState; keepBoth(g)
  const alcazar = placeSite(g, 0, 'Astral Alcazar', 3, 2)
  const source = placeSite(g, 0, 'Rustic Village', 4, 2) // the Alcazar is nearby this silence source
  const walker = summonCard(g, 0, 'Bone Jumble', 0, 2); walker.enteredTurn = -1
  walker.region = 'void'
  walker.modifiers.push({ kind: 'keyword', keyword: 'voidwalk', duration: 'permanent', turn: g.turn } as any)
  return { g, alcazar, source, walker }
}

const reaches = (g: GameState, u: Parameters<typeof reachableLocations>[1], s: Step) =>
  reachableLocations(g, u).some((r) => r.x === s.x && r.y === s.y && r.region === s.region)

describe('silenced step-granting sites grant no steps', () => {
  it('an active Astral Alcazar links the void to itself (control)', () => {
    const { g, walker } = setup()
    expect(isLegalStep(g, walker, voidSq, alcazarSq)).toBe(true)
    expect(reaches(g, walker, alcazarSq)).toBe(true)
  })

  it('a silenced Astral Alcazar links nothing — isLegalStep agrees with the search', () => {
    const { g, walker, source, alcazar } = setup()
    g.flow = { ...(g.flow ?? {}), siteSilences: [{ siteId: source.id }] } as any
    expect(siteSilenced(g, alcazar)).toBe(true)
    expect(isLegalStep(g, walker, voidSq, alcazarSq)).toBe(false)
    expect(reaches(g, walker, alcazarSq)).toBe(false)
  })
})
