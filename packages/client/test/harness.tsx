// GameHarness — mounts the REAL client Game component in jsdom and drives it by
// clicking DOM elements, exactly as a human player would. It uses the SAME
// seat-resolution code as the live app (App.hotseatViewpoint / App.actingPlayer),
// and its `send` mirrors App's hotseat send precisely:
//   applyAction(state, actingPlayer(state, action), action)
// recording any result.ok===false as a DRIFT error (the UI offered a click the
// engine rejected), then bumping a counter to re-render.
//
// CRITICAL project rule (see App.tsx ~line 155): NEVER call applyAction inside a
// setState updater — React StrictMode double-invokes updaters, which would
// double-apply every action. We mutate the state OUTSIDE the updater and only
// bump a render counter inside it. We also do NOT wrap in StrictMode.

import { act, render, cleanup, fireEvent, type RenderResult } from '@testing-library/react'
import { useState, useEffect } from 'react'
import {
  applyAction,
  viewFor,
  type Action,
  type GameState,
} from '@sorcery/shared'
import Game from '../src/components/Game'
import type { Session } from '../src/App'
import { hotseatViewpoint, actingPlayer } from '../src/App'

export interface DriftError {
  action: Action
  actor: number
  error: string
}

export class GameHarness {
  /** the live, mutable engine state (engine mutates in place). */
  state: GameState
  /** DRIFT errors: the UI offered a click the engine then rejected. */
  drifts: DriftError[] = []
  private bump: (() => void) | null = null
  private rr: RenderResult | null = null
  /** the hotseat Session handed to Game — its `send` is the EXACT app send path
   *  (applyAction outside any updater + drift recording). Exposed so negative
   *  controls can prove ENGINE_REJECT by sending an illegal action the same way a
   *  mis-wired click would. */
  session!: Session

  /** render the Game in mobile GUI mode (set before mount()). */
  mobile = false

  constructor(state: GameState) {
    this.state = state
    this.session = this.makeSession()
  }

  /** the hotseat Session, wired precisely as App.startHotseat wires it. */
  private makeSession(): Session {
    return {
      kind: 'hotseat',
      seat: null,
      local: this.state,
      view: null,
      send: (action: Action) => {
        // mirror App's hotseat send EXACTLY: resolve the actor via the app's own
        // actingPlayer, apply OUTSIDE any updater, record drift, then re-render.
        const actor = actingPlayer(this.state, action)
        const result = applyAction(this.state, actor, action)
        if (!result.ok) {
          this.drifts.push({ action, actor, error: result.error ?? 'illegal action' })
        }
        this.bump?.()
      },
    }
  }

  /** mount the real Game component. Call inside act() via mount(). */
  mount() {
    const harness = this
    const session = this.session

    function Wrapper() {
      const [, setTick] = useState(0)
      useEffect(() => {
        harness.bump = () => setTick((t) => t + 1)
        return () => { harness.bump = null }
      }, [])
      // recompute the view + viewpoint from the live state on every render, exactly
      // as App does for hotseat mode.
      const viewpoint = hotseatViewpoint(harness.state)
      const view = viewFor(harness.state, viewpoint)
      return (
        <Game
          session={session}
          view={view}
          hotseatViewpoint={viewpoint}
          clockNow={0}
          clockAnchorAt={0}
          mobile={harness.mobile}
          onLeave={() => {}}
        />
      )
    }

    act(() => {
      this.rr = render(<Wrapper />)
    })
    // dismiss the pre-game "VS" splash (shown on turn 1) so it doesn't overlay the board and
    // swallow the click-driven tests; a click on it closes it, exactly as a player would.
    const splash = this.rr.container.querySelector('[data-pregame-vs]') as HTMLElement | null
    if (splash) act(() => { splash.click() })
    return this
  }

  /** the mounted document body element. */
  get container(): HTMLElement {
    if (!this.rr) throw new Error('harness not mounted')
    return this.rr.container
  }

  /** force a synchronous React re-render from the current live state. */
  rerender() {
    act(() => {
      this.bump?.()
    })
  }

  /** send an action through the exact hotseat send path, wrapped in act() so the
   *  re-render it triggers is flushed cleanly (used by negative-control tests). */
  send(action: Action) {
    act(() => {
      this.session.send(action)
    })
  }

  /** click a DOM element and flush React updates synchronously. Uses Testing
   *  Library's fireEvent so the MouseEvent is constructed the way jsdom accepts
   *  (a raw `new MouseEvent('click',{view:window})` throws in jsdom). The click is
   *  dispatched on the innermost element you pass — matching the mission's rule
   *  that a unit/site inside a square stopPropagation()s the square's onClick. */
  click(el: Element) {
    act(() => {
      fireEvent.click(el)
    })
  }

  /** type a value into an input and flush (used by the free-text nameCard prompt).
   *  fireEvent.change sets the React-controlled value and dispatches input. */
  type(el: HTMLInputElement, value: string) {
    act(() => {
      fireEvent.change(el, { target: { value } })
    })
  }

  unmount() {
    cleanup()
    this.rr = null
    this.bump = null
  }

  /** after each click, re-render and let any pending effects settle. Because our
   *  send is synchronous (local hotseat) a rerender is enough; this exists as the
   *  documented settle point the driver loops on. */
  async driveToQuiescence(step: () => boolean, budget = 25): Promise<void> {
    for (let i = 0; i < budget; i++) {
      this.rerender()
      const done = step()
      if (done) return
    }
  }
}
