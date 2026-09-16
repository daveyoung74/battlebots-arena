> Legacy v1 / local exhibition reference. Requires explicit `ARENA_MODE=legacy`. For the current read-only v2 viewer, see [the v2 guide](protocol-v2.md).

# Validation and release boundary

## Checks provided

- Engine: seeded reproducibility, persisted resume, simultaneous knockout, legal resources, termination, actual strategy effects, rules-1 compatibility and rules-2 Guard counters.
- Broadcast: stable entrance envelopes, bounded cues, replay duration, no future event/seed/strategy disclosure, headless mode and expiry preserving results.
- Scheduling: published slots preserve an entry window and the configured notice period.
- Crypto: exact-body tampering and timestamp-window checks.
- SQL integration: concurrent workers persist one result, cancelled matches cannot advance, and signed HTTP entry waits for a finalized receipt. Settlement retries send identical results.

Run `npm test`, `npm run build`, and `npm run test:integration`. The CI workflow creates a dedicated MySQL database, runs migrations, and executes these checks.

Run `npm run balance` to reproduce the strategy matrix. `npm run replay:stats` measures the actual retained event and audio payload sizes in the configured database.

## Companion BattleBots checks

The platform change includes two opt-in integration tests:

- `arena-rails.integration.test.ts`: isolated unlisted champion/staging game; Practice has no reward/record changes; Casual awards configured XP and a winner mark exactly once; correction reverses the mark and updates the Casual record without changing Ranked rating.
- `arena-conformance.integration.test.ts`: starts this repository as an independent HTTP service, bridges signed requests to the real platform lifecycle, and exercises the existing 19-case listing gate with a disposable champion. It passed after the gate learned to prepare opportunities through `ready_contract:1` and use the manifest's real strategy field for its permission check.

From a configured BattleBots checkout, use the corresponding environment opt-in and test command:

```sh
ARENA_RAILS_TEST=1 npx tsx --env-file=.env --test src/server/arena-rails.integration.test.ts
ARENA_SAMPLE_PATH=/path/to/battlebots-arena npx tsx --env-file=.env --test src/server/arena-conformance.integration.test.ts
```

PowerShell users set these values with `$env:ARENA_RAILS_TEST='1'` / `$env:ARENA_SAMPLE_PATH='C:\\path\\to\\battlebots-arena'` before running the commands.

These tests remove only their fixture records. They neither list the sample as a production game nor send real champion announcements. Production listing still uses the normal platform gate.

## Manual review performed

The local standalone preview was checked signed-out at desktop and 390-pixel phone widths. The Training room submits real server simulations. Public live state, stored replays, captions, original portraits and the headless result/log presentation were reviewed. Automated fixture coverage is stronger than this visual review for settlement and authorization.

## Still operator-dependent

No production subdomain or ElevenLabs voice ID is bundled. Live provider playback, deployment-host restarts/proxy behavior, real owner login/return, and actual public Announcr-channel delivery require the configured deployment. The provider uses caption fallback until configured; the repository does not claim those external accounts have been connected by its tests.

The wider design includes future automated matchmaking, paid PvP, prediction markets, administrative correction/replay revisions and venue delivery. This version implements explicit free Casual/Ranked entry and the public presentation seams for those extensions.
