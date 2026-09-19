# V2 viewer validation and release boundary

## September 19 approved public delivery extension

The separate [free-live reader](free-live.md) adds reviewed match/profile/commitment pins, a fixed public origin, bounded credential-free fetches and manual result refresh. All 36 sample tests pass, including finalized-to-released-to-recorded progression, evidence/status regressions, source failure without stale fallback, redirects, request coalescing and restarts. The production TypeScript/Vite build, formatting and unchanged 50-file vendor provenance check pass.

Production-style browser checks at 1440px and 390px used a clearly labeled disposable fixture source: local playback, manual finalized-to-released refresh with reported credit, walkovers without combat, failure hiding the old replay and successful retry. Source request counts confirmed no per-frame or background status polling. No horizontal overflow was observed. These UI checks are distinct from the paired native-chain rehearsal in the application's `docs/FREE_MATCH_PUBLIC_DELIVERY.md`; neither activates a real service.

## September 19 walletless archive extension

The separate [free-authority archive](free-matches.md) adds seven tests (33 sample tests total). They cover application-produced played and walkover exports, exact pins, caller/event/state/finality tampering, invalid replay progression, a pending completion retaining its certified time, read-only HTTP, bounded files and replacement rejection across restart. The 57 public-package tests, 50-file provenance check, TypeScript/Vite build and formatting check pass. The archive packaging command was exercised on disposable local files.

Browser checks covered development and production-style startup, desktop and 390px layouts, playback, restart, keyboard seeking, speed selection and walkovers without combat controls. No horizontal overflow or replay errors were observed in the final production-style checks. Development startup initially picked up the parent workspace PostCSS configuration; the explicit sample configuration fixes that. Navigating away from the development server produced Vite websocket-close diagnostics. The sample displays fixed source-reported completion snapshots; live status transport and staging remain open. The paired application's current report is `docs/FREE_SAMPLE_CONFORMANCE.md` in the companion branch. No deployment was performed.

## Original v2 milestone

The default demo contains only synthetic public vectors. `fixtures/viewer.json` uses real AgentBorn duel-interpreter output for played events, with artificial receipts and identities. Its walkover and cancellation are synthetic public-schema examples. It contains no private strategy, real champion, live credential or application database export.

The checks below passed locally on 2026-09-16 UTC. Both development and production-style fixture startup were exercised. The paired application contract/SQL/HTTP handoff passed all four nested tests after fixing its seeded-cancellation qualification read route. Docker configuration is supplied but a container build/deployment was not run.

## Local checks

- `npm test`: 26 tests covering preserved legacy engine behavior plus v2 played/walkover/cancelled rendering, bounded and malformed packages, wrong policy/identity/roster/renderer/timing, altered encrypted openings, public delay, studio credential scope, signal-only refresh, immutable cache retries/restart/races/corruption, HTTP route isolation, and reusing an unreleased studio cache in public mode.
- `npm run test:protocol`: 57 tests in the exact vendored public package, including canonical bytes, sealed packages, signatures, rules and seven-day per-game training evidence. These tests do not independently authenticate a real chain.
- `npm run test:vendor`: verifies all 50 vendored source files against the provenance record.
- `npm run build`: TypeScript plus Vite production build.
- `npm run format:check`: sample formatting, excluding untouched vendored code and synthetic fixture bytes.
- `npm run test:local-db`: initializes a fresh loopback MySQL data directory, verifies server identity, uses generated test-only credentials, runs migrations and four legacy SQL/signed-HTTP tests, and shuts down the server. It never reads an existing `DATABASE_URL` or loads an application `.env`. Diagnostics remain under ignored `.local-test`. Set `ARENA_TEST_MYSQLD` if the binary is not at its standard Windows location or on PATH.

CI uses its own MySQL service for legacy integration; only the migration/integration steps enable legacy mode. To use a separate dedicated test database manually, set `ARENA_MODE=legacy`, `ARENA_DEMO=false`, `ARENA_WORKER=false` and its `DATABASE_URL`, then run `npm run db:migrate` and `npm run test:integration`.

## Application conformance

The companion AgentBorn application handoff imports this public sample's adapter, verifier, cache and studio signer via an explicit **test-only** checkout path. The sample does not import private application code. The application owns synthetic fixture generation and disposable contract/database orchestration.

The paired report records real local HTTP early-package authorization, nonce consumption, pre-reveal denial, complete-package cache restart, official public opening and local playback. It also exercises terminal completion and both pre-qualification and seeded deadline cancellation through the application's verified readers. No staging service, public RPC, production keys or real funds are used.

## Browser checks

The fixture viewer is checked at 1440px and 390px, including complete page layout, playback, restart, seeking, speed, walkover and cancellation selection. Controls use native buttons/selects/range/meter elements, keyboard seeking and explicit focus outlines. Sound is opt-in; the interface adds no continuous decorative motion and honors reduced motion. These checks supplement the document/authority tests; they are not a financial audit.

## Remaining release work

- Mount approved AgentBorn public result/cancellation routes and the human-session status service in the target environment.
- Admit a real game/version/configuration and approve any studio key outside this sample.
- Repeat conformance against that staging deployment and review HTTPS/proxy, cache permissions/retention, restarts and access controls.
- Integrate a live authenticated Training Grounds status/countdown on AgentBorn, without passing handler sessions to a game operator.
- Design and test paid/multi-entrant formats and non-duel renderers separately.
- Independent security review and production activation remain outside this implementation.

The sample's old registration/listing evidence is retained under the explicitly marked [legacy validation guide](validation.md). It does not certify this v2 deployment.
