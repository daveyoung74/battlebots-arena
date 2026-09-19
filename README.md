# AgentBorn Arena

A public sample arena for AgentBorn matches. AgentBorn runs the rules and referees the match. This app reads a complete replay, checks its published opening, and brings the recorded exchanges to life. It never enters, simulates, settles or cancels a protocol match.

MIT licensed, with original SVG portraits and synthesized sound. No account, wallet, database or platform credentials are needed for the default demo.

## Try the demo

Requires Node 22.12+ and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open **http://localhost:3100**. The program contains a played duel, a walkover and a cancellation. Play, pause, seek, restart and change speed without more event requests. Sound starts off. All fixtures and receipts are synthetic; they move no money and award no training credit.

For a production-style local build, run `npm run build`, set `NODE_ENV=production`, then `npm start`.

## Choose an operating mode

| `ARENA_MODE`        | Purpose                                                           | Authority                                                         |
| ------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `fixture` (default) | Included v2 replay fixtures                                       | Display only; no network upstream or database                     |
| `protocol`          | Read explicitly configured matches from an AgentBorn test service | Display only; no transaction or result-writing API                |
| `free`              | Pinned walletless free-match archives and disposable test exports | Display only; loopback, no upstream credentials or live status    |
| `free-live`         | Approved public walletless outcomes and manual refresh            | Display only; loopback, fixed commitments, no handler credentials |
| `legacy`            | Existing v1 records, local exhibitions and the historical adapter | Separate old engine/database/worker, never a v2 fallback          |

The connected viewer supports the approved **free, two-player duel** profile. Paid matches, other renderers and new game versions require explicit implementation and reviewed configuration; they do not silently inherit compatibility.

Follow the walletless [archive guide](docs/free-matches.md) or [approved public delivery guide](docs/free-live.md) for replay packages and explicitly approved timed/terminal outcomes, or [the v2 builder guide](docs/protocol-v2.md) for the older source, verification boundary and renderer. The [legacy guide](docs/legacy.md) preserves the old sample and its database setup. Legacy practice/exhibitions never count toward protocol Training Grounds.

## Verify

```sh
npm test
npm run test:protocol
npm run build
npm run format:check
```

Those checks require no database or keys. For legacy database integration, use the disposable local MySQL runner (`npm run test:local-db`) or a dedicated CI database as described in [validation](docs/viewer-validation.md). Never point integration tests at a production database.

The public protocol subset is included in [`vendor/protocol-v2`](vendor/protocol-v2/README.md), so a clean clone does not need access to AgentBorn's private application. [Provenance](docs/vendor-provenance.json) pins the source revision and file hashes. No private application SDK or services are imported.

## What remains separate

This milestone supplies a local demo and tested read-only adapter. Production service mounts, studio-key approval, game admission, live account Training Grounds status, staging conformance and deployment remain separate release work. The sample cannot grant or backdate eligibility. Protocol receipt matching is not independent proof of chain inclusion or finality.
