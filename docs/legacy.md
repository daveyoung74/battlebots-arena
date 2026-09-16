> Legacy v1 / local exhibition reference. Requires explicit `ARENA_MODE=legacy`. For the current read-only v2 viewer, see [the v2 guide](protocol-v2.md).

# BattleBots Arena

A small, server-authoritative gladiator game and public broadcast, built as a standalone sample of the BattleBots game contracts. React animates champion portrait tokens; a durable worker runs the fight. Nobody needs an account to watch.

MIT licensed. Original SVG portraits and synthesized sound effects are included. ElevenLabs narration is optional and uses your own voice and API key.

## Run locally

Requires Node 22.12+ and MySQL 8. Run commands from this repository.

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`. For a disposable local database, run `docker compose up -d db`; the example URL matches this database.
3. Run:

```sh
npm ci
npm run db:migrate
npm run dev
```

Open **http://localhost:3100**. House exhibitions rotate automatically. The Training room lets you change tactics and run either a visual duel or a fast simulation. This works without BattleBots registration, login, or a voice provider.

Migrations touch only `arena_` tables. Configuration is server-only. The game never reads BattleBots tables or imports its implementation. A shared MySQL instance is supported, but is not required.

## What is included

| Mode              | Opponent                 | Rewards                                            | Timing                                |
| ----------------- | ------------------------ | -------------------------------------------------- | ------------------------------------- |
| House exhibition  | Included house presets   | None; no platform identity                         | Continuous demo or on demand          |
| Practice          | House opponent           | No XP, prizes, rating, or competitive record       | On demand; visual or outcome/log only |
| Casual / unranked | Another owner's champion | Platform-configured XP and applicable game rewards | First two finalized entries           |
| Ranked            | Another owner's champion | Platform XP/rewards and Ranked record/rating       | Published show slots                  |

Casual is rewarded unranked competition. Practice is an explicit testing sandbox. The current platform winner-mark rule applies to competitive matches; this sample does not mint tokens or invent its own prize ledger.

- Deterministic simultaneous exchanges, three strategy sliders, stamina, guards, feints and a knockout/decision finish.
- SQL row locks, pinned rules/strategy, durable settlement retries, and zero-viewer execution.
- Public live view, reconnect recovery, broadcast embed, compact replay, scrubbing, 1×/2× playback, and turning-point review.
- Individual portrait entrances, captions, optional cached house narration, mute/volume, reduced-motion support, and mobile layout.
- Confirmed lineup, pre-show notice, cancellation/reminder events through BattleBots' existing Announcr outbox, verified rivalry evidence, and live champion-token links.
- A versioned entrance cue envelope ready for a future venue adapter. No venue devices are contacted.
- Signed adapter client, inbound HMAC validation, durable nonces, generic owner entry and GrokBot preparation.

## Connect BattleBots

See [the contract guide](contract.md). Register a separate game using slug `gladiators` and the manifest at `/api/manifest`. Set `ARENA_GAME_ID`, `ARENA_PRIVATE_KEY`, `ARENA_INTERNAL_KEY`, `BATTLEBOTS_URL` and your absolute `ARENA_PUBLIC_URL`. Publish/pin the manifest and pass the platform's normal listing gate.

The platform must support the additive preparation, finalized-entry receipt, schedule and Practice capabilities described in that guide. These were implemented alongside this sample. Older platform releases need those additions.

Owner authentication, champion selection, strategy editing, and entry authorization remain on BattleBots. The Arena subdomain never receives session cookies or GrokBot tokens. Preparing a match is not permission to enter it.

## Verify

```sh
npm test
npm run build
npm run test:integration
npm run balance
npm run replay:stats
```

Unit tests need no database. Integration tests use your configured database and clean up their own match fixtures; use a dedicated test database in CI. They cover SQL concurrency, signed HTTP, finalized-entry reconciliation, frozen tactics and settlement retry. `balance` compares five presets over 25,000 deterministic duels; `replay:stats` reports retained event sizes and audio storage.

The companion platform checks cover actual XP/prize correction behavior and 19 listing-conformance cases against this standalone HTTP server using an isolated staging game and disposable champion. See [validation](validation.md).

## Deploy and extend

See [deployment](deployment.md), [contracts](contract.md), [rules and balance](rules.md), and [the broader design](design.md).

The delivered scheduler reserves the next available show slot after **two explicitly authorized entries**. Strategy freezes at entry. Automatic rating-based matchmaking, deferred entry grants, paid PvP, prediction markets, venue delivery and administrative replay corrections are extensions, not live integrations in this release. The exact production subdomain and ElevenLabs voice are operator configuration.

The included visual identity is a sample. Replace the house portraits, styling and narration templates to make your own game.
