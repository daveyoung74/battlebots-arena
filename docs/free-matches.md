# Walletless free-match archive

`ARENA_MODE=free` reads `free.match.public-package.1`, the independent walletless authority implemented by AgentBorn. It does not translate that package into the older `agentborn/2` financial manifest or run the legacy engine. The existing `fixture`, `protocol` and `legacy` modes keep their original wire formats.

## Run it locally

Install Node 22.12+, then run `npm ci`. In PowerShell:

```powershell
$env:ARENA_MODE = 'free'
npm run dev
```

On other shells, use `ARENA_MODE=free npm run dev`. Open `http://127.0.0.1:3100`. The included program uses **disposable local-chain exports**, labeled as test data. Their test clock can differ from real time. Recorded credit belongs to disposable identities; viewing them grants nothing.

Play, pause, seek, restart and change speed locally. Walkovers show the qualified winner without invented combat. Cancellation and unsubmitted outcomes have no result package and are not converted into fake replay files.

## Package boundary

The archive requires a **finalized or released** outcome. A result commitment alone is insufficient. AgentBorn can disclose a complete opening at its reveal boundary before finalization, but that package does not include a fresh publication-head proof; this archive deliberately waits for the finalization receipt. It does not add event streaming or keep a connection to a handler session.

Configure `ARENA_FREE_CONFIG` to an absolute path to `viewer.json`, or use the included `fixtures/free/viewer.json`. The config contains `mode: free`, `provenance: disposable-test | published-export`, and at most 32 unique match entries with:

- `id`: the exact match ID; the file must be named `<id>.json` in the same directory.
- `profileHash`: independently reviewed free-authority profile hash, including chain, board, referee, game, rules and timings.
- `packageHash`: Keccak of the entire canonical JSON document, up to 2 MiB.
- `label` and two `champions` display names. These are presentation labels, not verified identity claims.

The optional `scripts/free-archive-config.ts` helper writes new archives without overwriting existing files:

```sh
npx tsx scripts/free-archive-config.ts ./my-archive disposable-test "Pilot match" "Rook" "Nyx" ./export.json
```

Create the output directory first. **Computing a hash does not establish authenticity.** Review the export's origin and profile before trusting its pin. Obtain only already-public material through an approved export process. Do not give the sample a handler cookie, private strategy, worker certificate key or signing key. For separately approved public retrieval, use [the explicit free-live mode](free-live.md); archive mode remains offline.

The server binds to loopback, rejects cross-site/foreign-host requests and writes no protocol state. Only allowlisted IDs have bundle routes. There is no signal/polling endpoint in this mode. Each file is rechecked against the startup config, including after process restart; replacing it with a different outcome, profile or credit snapshot fails closed. To display a later recorded completion, deliberately review a new package/config and restart. A loaded browser keeps the existing snapshot until reload.

## What is checked

The independent reader checks the configured profile and full-package pins, free revision, manifest/roster/permission bounds, game/rules hashes, scheduled windows, opening, seed/outcome/result commitment domains, replay identity and bounded fighter progression. It matches supplied successful transaction calls, callers, chain IDs, block references, unique result/finalization/release events, state tuples and claimed finality depth/time to the package. Finalization must occur at or after reveal and release at or after its delay.

These are **archive consistency checks**, not independent chain inclusion or live canonicality proofs. The reader does not contact an RPC, verify historical contract bytecode, re-run private strategies, verify execution certificate signatures or prove the completion journal. Completion and training credit are explicitly source-reported snapshot data, never eligibility or current account status. AgentBorn's native server remains responsible for those authoritative checks. Do not use the sample to authorize admission, settlement or credit.

## Validation and integration

`npm test` covers pins, authority separation, evidence tampering, malformed re-sealed replay progression, played/walkover rendering, read-only HTTP, missing files, changed archives and restarts. `npm run build`, `npm run test:protocol` and `npm run test:vendor` retain the existing public-package checks. The new reader imports only public primitives and schemas; the vendored 50-file source snapshot remains unchanged.

The paired application suite can load this checkout through `FREE_SAMPLE_VIEWER_ROOT`. It runs the real disposable board, database, signing service and approved worker, then presents their published played/walkover packets through this reader and HTTP server. It also covers finalized, released-awaiting-record and completed snapshots, corrupt replacements and restart. See the companion application handoff `docs/FREE_SAMPLE_CONFORMANCE.md` for exact commands and revision evidence. This local evidence is not a production or real-provider rehearsal.

Approved finalized/released public retrieval and manual result refresh are implemented in the separate [free-live mode](free-live.md). Early-opening evidence, cancellation-only signals, real-provider two-handler staging, game admission and production activation remain separate release work.
