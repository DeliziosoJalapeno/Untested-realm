# Untested Realm — a *Sorcery: Contested Realm* simulator

**▶ Play now at [untestedrealm.com](https://untestedrealm.com)**

An unofficial, fan-made online simulator for the **Sorcery: Contested Realm** trading card
game, built around a complete, faithful rules engine — the 5×4 realm grid, the four regions
(surface / underground / underwater / void), turn structure, mana & elemental thresholds,
movement, combat with defend / intercept / simultaneous strikes, death's door, and fully
scripted card effects.

All **~1,100 cards** of the Alpha and Beta sets are implemented (497 minions, 208 sites,
202 magics, 129 artifacts, 38 auras, 34 avatars) — from plain keyword vanillas up to the
gnarliest scripted interactions, backed by a suite of **1,190+ automated tests**.

> Card names, text, and imagery are © Erik's Curiosa Limited. This project is a fan-made
> playtest tool and is **not affiliated with or endorsed by** the publisher.

---

## What you can do

- **Play online** — create a room (public or private), or hit *Find a battle* for
  matchmaking. Sign in to keep your decks and collection across devices and to rejoin games
  in progress.
- **Play the computer** — a real look-ahead search bot, not a scripted dummy.
- **Hotseat** — two players pass-and-play on one screen.
- **Sealed / Limited** — open seeded booster packs, build in a timed deckbuild phase, and play.

…plus a full **deck builder** (import straight from a [curiosa.io](https://curiosa.io) link,
tag filters, curve & element analysis, alternative card art), **secret achievements**, an
in-game **rulebook / FAQ overlay**, and a **mobile** layout for phones.

## Quick start (development)

Requires **Node 22+** (the server uses the built-in `node:sqlite`) and **Python 3** for the
one-time image fetch.

```bash
npm install
npm run fetch:images   # one-time: download + compress the card images into the client
npm run dev            # server on :8787, client on :5173 (Vite)
```

Open the Vite URL and pick a starter deck. For a production build, run `npm run build` then
`npm start` — the server then serves the built client from `http://localhost:8787`.

## Architecture

A TypeScript monorepo (npm workspaces):

| Package           | What it is                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `@sorcery/shared` | The rules engine + all card scripts. Pure, deterministic, no I/O. The bot's evaluation heuristic and legal-move generator live in `src/bot`. |
| `@sorcery/client` | The React + Vite front end (board, deck builder, all UI) and the search bot.                 |
| `@sorcery/server` | Node HTTP + WebSocket server; accounts and persistence via `node:sqlite`.                    |

Card scripts live in `packages/shared/src/cards/scripts/`: **one file per card** in `gen/`,
with shared helpers in `multi-card-utils/` (one logical function per file). The card index
(`gen/index.ts`) is generated — to add a card, drop a new `gen/<slug>.ts` that calls
`registerScript(...)` and run `npm run gen:card-index`:

```ts
registerScript('Immolation', {
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby' }],
  onCast: (ctx) => ctx.dealDamage(ctx.targets[0], 7),
})
```

`targeted: true` enforces the game's targeting rule (same region as the caster, blocked by
Stealth, breaks Ward); non-targeted effects reach hidden regions, per the rulebook. Genesis /
Deathrite triggers, activated abilities, static grants, and mid-effect prompts (`ctx.ask`)
are all supported — see `registry.ts` for the full `CardScript` interface.

## Testing & tooling

```bash
npm test           # the engine test suite (vitest) — 1,190+ tests
npm run fuzz       # cast + combat crash fuzzers (must find 0 crashes)
npm run arena      # old-vs-new bot gauntlet (win-rate + crash gate)
npm run audit:dom  # drives every card through the real GUI in jsdom
```

## Deploying

A single-container image builds the client and serves it from the server:

```bash
docker build -t untestedrealm .
docker run -p 8787:8787 untestedrealm      # http://localhost:8787
```

For a throwaway public demo over a free Cloudflare tunnel, run `docker compose up -d --build`
and read the tunnel URL from `docker compose logs tunnel`.

## Contributing

Issues and PRs are welcome — especially card-script fixes and rules-edge-case reports. When
implementing a card, add a focused test alongside it; the rulebook and official FAQ are the
source of truth on any rules dispute.

## License

Code is provided as-is for non-commercial, fan use. Card data and art remain the property of
Erik's Curiosa Limited; please do not redistribute the card images.
