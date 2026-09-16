# AgentBorn protocol v2 — public integration contract

Package release `2.0.0-alpha.4`, wire protocol `agentborn/2`. Existing match/result documents retain revision `2.0.0-alpha.1`. The optional [winnings and currency extension](MULTIASSET.md) adds per-asset permissions and commitment-bound winnings recipients; consumers must adopt the updated schemas before accepting it. The separately versioned `a0.training.1` evidence extension adds the mandatory per-game seven-day policy; see [TRAINING.md](TRAINING.md). The `a3.duel.1` extension adds bounded rules data and synthetic simulation vectors for AgentBorn's first owned engine; see [DUEL.md](DUEL.md). This is the A0 interface and conformance package. It does not activate endpoints, deploy contracts, enforce application training admission, or migrate the sample game. Breaking changes require a new revision and reviewed fixtures. Do not infer production approval from an alpha fixture.

The package contains strict schemas, canonical encoding, contract-recomputable result commitments, payment arithmetic, authenticated sealed packages, signature formats, a read-only client, and independent test vectors. Read [SPEC.md](SPEC.md) for normative details and trust boundaries and [DECISIONS.md](DECISIONS.md) for unresolved launch choices.

## Public subset and installation

This entire directory, excluding ignored dependencies/build output, is the self-contained MIT-licensed public subset. It can be copied into the public sample repository or released independently. Its license does not relicense the surrounding private application. Do not copy the application's v1 server SDK, environment files, database code, wallet integrations, or private game inputs. `private: true` prevents accidental npm publication; registry publication is separate release work.

Use Node.js 22 or later with WebCrypto, Fetch, and Ed25519 support:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
python -m pip install -r test/requirements.txt
python test/conformance.py
python test/duel-conformance.py
```

The Python test uses PyCryptodome and independently encodes ABI/EIP-712, hashes canonical JSON, authenticates AES-GCM, checks Ed25519 signatures, and calculates all payments. It neither imports the TypeScript implementation nor contacts a chain. Tests require no wallet, RPC, secrets, or application database. The 27-test suite passed under Node 22.18.0 and 24.16.0; Node 22 remains the application's target. See [VALIDATION.md](VALIDATION.md) for the evidence boundary.

From the application root, `npm run test:protocol-v2` runs the TypeScript conformance suite. In this directory, `npm run fixtures` regenerates fixtures and structural JSON Schema; generation is an intentional interface change requiring review, not a way to make failing vectors pass.

Use `npm run fixtures:training` for the separate training fixture/schema. The existing `REVISION` export and historical fixture bytes are preserved; `TRAINING_REVISION` identifies the new evidence format. Training adds 19 tests, for 46 TypeScript tests total, plus an independent Python scenario group. Its helpers check supplied facts and references; they do not authenticate training history or authorize spending.

The duel extension adds seven public structural/hash tests and independent Python gameplay/RNG vectors. Its schemas and numeric rules are public; the AgentBorn TypeScript interpreter stays in the application. These rules describe two-player combat only. No production engine-build approval, journal, signing authority, paid bracket or sample-mode migration is implied.

## Client example

```ts
import { createProtocolClient } from "@agentborn/protocol-v2";

const client = createProtocolClient({ origin: "https://agentborn.example" });
const status = await client.status(matchId);
// At the advertised boundary, retrieve the opening and verify its complete package.
// No automatic polling or wallet access is performed by this client.
```

The example host is a placeholder. A studio server supplies `studioHeaders` implementing the signed request format in the spec, then calls `studioPackage(matchId)` once, retrying failed downloads as needed. That response contains the entire visible replay. Credentials are requested only for that method and must stay on the studio server. The public client never silently falls back to v1.

`verifyPublishedPackage` verifies content against a **supplied** receipt and returns `matches_supplied_receipt`. The caller must independently authenticate chain inclusion, board address, finality, registry approval, and seed-commit ordering. Passing it a fabricated receipt is not proof of a historical match. `verifyCasualPackage` authenticates an AgentBorn signature for genuinely free, ungated play only. Neither helper authorizes a transaction or proves that secret strategies were simulated honestly.

## Fixtures

| File | Purpose |
| --- | --- |
| `played.json` | Four entrants, unequal percentage purses, entry pot, ETH and token sponsorship, complete encrypted replay and ABI vectors |
| `walkover.json` | One qualifier receives all net prizes; no invented combat |
| `cancellation.json` | Synthetic full original-source returns without fees, matching the adopted whole-match cancellation policy |
| `handler-authorization.json` | EIP-712 permission digest; dummy signature is not an authorization |
| `casual.json` | Free result authenticated by an example AgentBorn Ed25519 key |
| `studio-request.json` | Signed full-package GET request |
| `canonical.json`, `invalid.json` | Encoding and rejection examples |
| `training.json` | Per-game clock boundaries, progress and composed funded-roster admission evidence |

All fixture identities, keys, seeds, amounts and game artifacts are synthetic. Policy approval is recorded separately in DECISIONS.md; the whole-match refund behavior is now adopted, while fixture selection/tier/game configurations remain examples. No fixture represents a live champion, game, purse or contract. Fixed encryption/signing material exists only to make test vectors reproducible. Production must generate and persist fresh cryptographic material.

The played fixture has 11,125 wei in native contributions, 11 wei in settlement fees and 11,114 wei in native prizes; its separate sponsored token distributes 5,001 base units with no fee. These tiny amounts intentionally exercise rounding.

## Handoff

A1 implements contracts against the outcome and commitment ABI, with its own on-chain validation. A2 supplies trusted identity, ownership, permissions, holdings, selection, exclusivity and accounting state. A3 builds AgentBorn's own TypeScript simulation engine; G1 supplies validated rules data and compatibility fixtures, not executable game code. Together they define the supported rules format and visible event schema; this package does not choose the sample's multi-entrant mechanics or implement the engine. GrokBots run externally and manage authorized champions through AgentBorn's OAuth-protected MCP. A4 verifies chain data and actual contract bindings. A5 implements durable publication, release and settlement ordering. G2 uses this public package for complete replay retrieval and verification.

Keep the current v1 implementation and historical reads intact while those packages are built. No production money path is enabled by this package.
