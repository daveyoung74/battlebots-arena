# AgentBorn v2 alpha integration specification

Revision `2.0.0-alpha.1`. The exported schemas, semantic validators, encoders and reviewed fixtures define this revision together. The generated JSON Schema describes structure only; canonical encoding, integer bounds, cross-document relationships, payment arithmetic and trust checks are additional requirements. Unknown properties and unsupported revisions fail closed. These routes and contract calls are future interfaces, not currently deployed services.

Package release `2.0.0-alpha.2` additionally provides the separately versioned [training evidence extension](TRAINING.md). It composes the existing admission-evidence slot for new funded rosters while preserving this match/result revision and historical bytes. The extension's policy, evidence, authority and activation requirements are normative for its users; existing readers are not automatically extension-aware.

## 1. Identity, authority and admission

Every top-level artifact carries `protocol: "agentborn/2"` and this revision. Stable 32-byte game IDs outlive immutable competitive versions. A version commits rules, strategies, public events, scoring, reduced-roster policy, runtime, RNG, numeric semantics and resource limits. Operator and GrokBot authorship have separate league IDs; each season pins one game version. Cosmetic renderer versions may change independently but cannot alter gameplay. Admission must verify the referenced bytes and approve their provenance; a matching hash alone does not approve a game.

The manifest binds chain, board, event, match, identities, exact times, permissions and ownership evidence, full ordered roster, contribution sources, treasury, fees and policy hashes. IDs are nonzero lowercase 32-byte hex. Addresses are lowercase 20-byte hex; zero token address means native ETH, never a payout recipient. This initial profile is chain ID `4663`; local fixtures are synthetic. A4 must verify actual chain identity and deployed code before using any address.

AgentBorn alone selects seats and authorizes commitment, simulation, cancellation and finalization. Studio credentials cannot exercise these powers. A provisional seat is not a financial commitment: obtain all configured seats, recheck actual ownership, availability, strategy readiness, holdings and spending permissions, then atomically commit the entire entrant roster. Maintain global exclusive champion leases and one linked handler per match. Featured bounty/sponsor proposals can be locked earlier but require separately specified proposal expiry/recovery; this alpha's match-cancellation document starts only after roster commitment. A1/A2 must define those proposal transitions before accepting proposal funds.

Tier thresholds are token quantities in integer base units, never token market value. Benefits are OR alternatives within an eligible tier; each benefit's format, roster size, available-purse interval and net-ETH-prize interval must all match. Bounds are inclusive and null maximum means unbounded. `explicit_only` uses only the selected tier's benefits. `cumulative` adds benefits from tiers whose quantity threshold is at most the selected tier's threshold; holding a higher amount does not silently change the selected event tier. A2 checks the selected tier threshold for each qualifying wallet and computes these benefit predicates from trusted purse and net-prize accounting. Sponsor tokens have no invented ETH value. The pure manifest validator checks configuration consistency, not real holdings or benefit qualification.

At start use the first canonical finalized block at or after `startAt`, the same block for all entrants. Persist the actual balance/ownership evidence. A shortfall against an existing holding gate is `no_show`; provider failure is `unknown`. Unknowns block resolution until bounded recovery establishes facts or authorized cancellation. Exactly one qualifier is a walkover; at least two use the version's pinned reduced-roster rules. Complete results list every qualified starter in rank order, even entrants receiving no prize. No qualified starter uses explicit zero-qualified recovery.

GrokBots run externally and manage handler-authorized champions through AgentBorn's OAuth-protected MCP. AgentBorn hosts the MCP/OAuth services and the deterministic game simulation, not GrokBot inference. League provenance records the authorized connection and strategy submission; it is not proof of an external model's execution. OAuth grants permit scoped management, not wallet signing or referee authority. A bot disconnect or revoked grant cannot retract a locked strategy or financial commitment. The runtime/RNG hashes in a competitive game version describe match simulation, not an external GrokBot process.

## 2. Canonical bytes and limits

The JSON profile is a restricted subset compatible with [RFC 8785](https://www.rfc-editor.org/info/rfc8785/): UTF-8 without BOM, whitespace or trailing newline; object keys sorted lexicographically; arrays retain order; ECMAScript JSON string escapes with valid scalar Unicode and no normalization. Keys are ASCII `[A-Za-z][A-Za-z0-9_]*`, excluding `constructor` and `prototype`. Reject duplicate keys, lone surrogates, sparse/decorated arrays, accessors, nonplain objects, cycles and unsupported values. Wire parsers require the received bytes to equal canonical re-encoding.

JSON numbers are safe integers only: no fractions, negative zero or exponents in serialized form. All financial amounts and uint256 counters use unsigned canonical base-10 strings, without leading zeroes. Times are uint64 decimal Unix seconds; replay offsets are integer milliseconds. IDs, addresses and hex data use lowercase `0x` encoding. Null is explicit where the schema permits it; it is not omission.

Ordinary documents are at most 1 MiB; replays at most 16 MiB. Depth is at most 32 and traversal at most 1,000,000 nodes. A roster has at most 64 entrants, at most 192 contribution sources and at most 100,000 events. A game may impose lower limits. Sealed plaintext is bounded by replay plus ordinary-document budgets; hex envelopes have the larger explicit `ENVELOPE_BYTES` limit. The first applicable byte, count or game limit wins. Do not promise that every simultaneous schema maximum fits a document. Enforce HTTP byte limits before parsing and deterministic execution/output limits inside the runner.

`hashDocument(x) = keccak256(UTF8(canonicalJson(x)))`. Ethereum Keccak-256 is not NIST SHA3-256. Public fixture containers are pretty-printed for reading; hash their named artifact values after canonicalization, not the entire fixture file. Game operators supply canonical, schema-validated rules data for AgentBorn's own custom TypeScript simulation engine. The alpha's `rulesArtifactHash` names the hash of that rules document; it does not denote executable operator code. `runtimeId`/`runtimeHash` identify the AgentBorn-owned engine and its reproducibly packaged build. G1/A3 define the supported rules format and engine-operation accounting. AgentBorn never imports or evaluates operator-supplied modules, plugins or binaries. Existing wire field names and commitment vectors remain unchanged; renaming them later requires an explicit protocol revision.

## 3. Financial outcome and commitments

Use standard [Solidity ABI encoding](https://docs.soliditylang.org/en/latest/abi-spec.html), `abi.encode`, never packed encoding. ABI integers are big-endian 32-byte words; addresses are left-padded; dynamic offsets are from the beginning of the encoded argument block. The following tags are Keccak-256 of the exact case-sensitive UTF-8 strings:

| Tag | Literal |
| --- | --- |
| seed | `AgentBorn.v2.seed.2.0.0-alpha.1` |
| outcome | `AgentBorn.v2.outcome.2.0.0-alpha.1` |
| result commitment | `AgentBorn.v2.result.2.0.0-alpha.1` |

The financial `resultHash` is **not** `hashDocument(result)`. It is Keccak-256 of this ordered ABI tuple:

```text
(bytes32 outcomeTag, bytes32 matchId, bytes32 manifestHash,
 bytes32 qualificationHash, uint8 kind, bytes32[] placements,
 uint16[] sharesBps,
 (bytes32 sourceId,uint256 chainId,address token,uint8 kind,
  address beneficiary,bytes32 championId,uint256 amount)[] payments)
```

Outcome kind: played `0`, walkover `1`. Payment kind: treasury `0`, prize `1`, return `2`, reservation release `3`. Null champion ID becomes zero bytes32. Ordinary played/walkover validation permits only its recomputed treasury/prize allocation. Array order is committed and cannot be sorted after hashing. The ABI outcome tag binds the schema revision.

Seed commitment is Keccak-256 of:

```text
(bytes32 seedTag,uint256 chainId,address board,bytes32 eventId,
 bytes32 matchId,bytes32 manifestHash,bytes32 seed)
```

Persist a fresh nonzero seed after start qualification and commit it before simulation. It is supplied only to AgentBorn's runner until public opening. Walkovers have no seed and use zero bytes32 as their seed commitment; do not hash a fabricated seed.

Result commitment is Keccak-256 of:

```text
(bytes32 resultTag,uint256 chainId,address board,bytes32 eventId,
 bytes32 matchId,bytes32 manifestHash,bytes32 resultHash,bytes32 replayHash,
 bytes32 seedCommitment,bytes32 sealedEnvelopeHash,uint64 revealAt,
 uint64 settlementNotBefore,bytes32 nonce)
```

The nonzero 32-byte nonce prevents guessing a small outcome space from the commitment. Keep it private with the encryption key until opening. Manifest chain, board, event, match and release times prevent cross-domain or rescheduled replay.

**A1 finalization must recompute the outcome hash from the actual winners and allocations used to settle.** Never accept a claimed result hash and a separate unbound winner list. Verify all source classifications, caps, qualified roster, fixed recipients, shares, conservation and timing against stored contract state. A manifest JSON hash is a metadata commitment, not a substitute for storing/enforcing critical typed lock terms. A4 must read back actual roster/source/policy/timing bindings and compare them before calling a match scheduled. The TypeScript validator is not a security boundary for Solidity callers.

Cancellation is a distinct terminal decision, with a canonical document hash and policy-bound original-source releases; it is not a played result hash. A1 must derive returns from stored contributions and enforce cancellation authority/state. It must not accept arbitrary refund recipients or trust a cancellation hash as withdrawal authority.

## 4. Source accounting and delivery

Available purse equals received/accounted total less reservations and existing liabilities; fail on underflow. Accept and monitor Pons-operated sweeps; pending upstream fees do not fund entry. Apply the handler's current 20–100% funding share to newly measured ETH receipts from the fixed escrow, with floor rounding to the vault and remainder to the fixed handler payout. This includes unsolicited aggregate escrow credits, recorded without inventing trading provenance. Direct unaccounted sink donations are not new allocations. Existing liabilities are not resplit. As vested buyback FanCoin is released, deliver the sink's recovered bound token entirely to the fixed handler payout wallet, retaining any failed delivery as a separate token liability. Do not apply the ETH funding split to FanCoin or automatically sell it. Neither vested tokens nor pending fees are spendable ETH purse funds.

Equal entry uses the exact amount. Percentage entry is floor(available-at-reservation × entryBps / 10,000); its minimum is an eligibility threshold, not a top-up. Featured bounty applies only to its named vault. All exposure remains bounded by the immutable 20% cap and any narrower handler maximum, retained-purse floor and gross daily budget. Proposal reservations use their recorded reservation snapshot; A2/A4 establish its truth and avoid counting the same reservation twice. Match-frequency and day-bucket accounting must be durable, even after retries and cancellations.

For each source, independently: fee = floor(gross × 100 / 10,000) for vault/entry pot, or zero for sponsor; net = gross − fee. Allocate floor(net × share / 10,000) to each paid rank, then add all remaining dust to rank one. Preserve source order; emit its nonzero treasury row first, followed by nonzero prize rows in rank order. Never combine sources before fee rounding, take another fee on delivery retries, or value unrelated tokens together. Sponsorship uses approved standard-transfer assets and placement awards only in this alpha. An external caller cannot relabel a registered vault as sponsorship to avoid fees.

Fixed entry pots require one recorded deposit per roster champion with the exact door fee. The funding wallet may differ from the handler's fixed prize wallet. Vault permission signatures do not authorize external wallet transfers: door fees, sponsorship and paid scout transactions need their own human-approved funding transaction or explicitly authorized application flow.

The adopted `refund_all` cancellation policy returns every deposit to its original funder and releases each canceled vault reservation inside that same vault, including no-show contributions when the entire match is canceled. `reservation_release` is an accounting release, not a transfer or a handler withdrawal. No cancellation fee is charged. Funded admission continues to reject the `unresolved` placeholder. Completed matches and walkovers retain no-show forfeiture.

The scout surcharge baseline is a platform admin setting, `scouting.baselineSurchargeBps`, represented as integer basis points from 0 to 10000. Null is unconfigured, not zero; new paid quotes must wait for admin setup. Compute `surchargeWei = floor(priceWei * baselineSurchargeBps / 10000)` and `totalWei = priceWei + surchargeWei` with checked integer arithmetic. A7 persists the exact rate and amounts in the order's quote/approval record referenced by `approvalHash`; the existing wire order already carries `priceWei` and `surchargeWei`. Later admin changes do not alter approved quotes, payment attempts or fulfillment retries. Included subscription reports do not use this charge. The admin baseline does not enable checkout by itself.

Allocation creates fixed-beneficiary liabilities once, then delivers them independently. A rejecting winner/treasury cannot block another recipient. A4/A5 must persist one stable payment identity per `(chainId, board, matchId, terminalDecisionHash, rowIndex)` and enforce uniqueness, where terminalDecisionHash is the ABI result hash or canonical cancellation hash. IDs may be persisted opaque nonzero bytes32; do not derive identity from payment contents alone because two deposits may produce identical rows. A transaction hash is an attempt, not the liability identity. A1/A4 must reconcile receipt/finality before marking delivered and must never retry an uncertain transfer as a new obligation.

## 5. Sealed replay, opening and time

The replay is one complete visual artifact: public names/cosmetics, initial visible state and ordered visible events. No private sheets, raw parameters, seed, encryption key or opening nonce belong in it. Strict root schemas alone cannot detect secrets hidden inside generic game payloads. G1/A3 must validate every payload against the admitted game event schema and a reviewed disclosure policy. The declarative rules format and AgentBorn TypeScript engine are G1/A3 deliverables; this alpha pins their identities without pretending a synthetic fixture implements the engine or authorizes executable studio content.

Create and durably persist fresh 32-byte encryption key, 12-byte IV and 32-byte nonce once. Persist the seed, inputs and resulting artifact for crash recovery; retries reuse that immutable artifact. Never reuse an AES key/IV pair for different plaintext. Fixed fixture material is public test data only.

Plaintext is canonical JSON `{result,replay,seed,seedCommitment,nonce}`. This inner container obtains its version binding from its result/replay documents and authenticated context. Encrypt with AES-256-GCM and a 128-bit tag, appending the tag to the ciphertext before lowercase hex encoding. Additional authenticated data is the canonical JSON object containing `protocol,revision,chainId,board,eventId,matchId,manifestHash,revealAt,settlementNotBefore` (canonical key order applies). `aadHash` is Keccak-256 of those AAD bytes. The envelope contains its algorithm, IV, ciphertext/tag, match identity and AAD hash; its hash uses canonical JSON. Compute plaintext/result/replay first, then envelope, then outer result commitment, avoiding circular hashes.

Schedule inequalities are:

```text
enrollmentClosesAt < startAt <= resultCommitDeadline
revealAt >= resultCommitDeadline + playbackSeconds
settlementNotBefore >= revealAt + extraSettlementDelaySeconds
```

The commitment must reach required finality and the complete studio package must be durably available by the commitment deadline. Receipt block time alone cannot prove when finality or storage readiness occurred; A4/A5 track those separately. Studio access starts only after commitment finality. This grants the full configured playback allowance even if the studio downloads at the deadline. No open stream, viewer acknowledgment or per-event polling is needed. A missed deadline must not slide the reveal clock; follow the committed exceptional recovery policy. A walkover uses the same public time gates with an honest empty combat replay.

Publish the sealed envelope and commitment before studio delivery. At `revealAt`, publish the opening with result, replay hash, seed, seed commitment, nonce, encryption key and envelope hash, along with public replay and qualification evidence. Public reads cannot require a studio credential. The opening endpoint returns `NOT_RELEASED` early, without sensitive response data. Keep a durable recovery copy of opening material with restricted access. A5 must actually publish before initiating finalization/payment; an on-chain timestamp alone cannot prove HTTP availability. Only after finalization reaches the committed finality policy and `settlementNotBefore` may payout submission begin. Network delivery can remain pending.

Studios can infer or disclose the ending from their advance replay; encryption does not hide it from authorized recipients. Any market relying on fairness must close before advance studio distribution, and consume the public AgentBorn signal for resolution. The package proves consistency with authenticated historical commitments when chain evidence is independently checked; it does not prove unbiased seed generation or independent execution of secret strategies.

Genuinely free, ungated play can use the Ed25519-signed casual signal instead of a chain receipt. Its signature covers every schema field except `signature`, including key ID, game-bound manifest hash, financial result hash, replay/seed commitments and publication time. Trust the registered AgentBorn key, not a public key supplied by an arbitrary replay. Casual authentication never enables money settlement.

## 6. API surface and authentication

All responses use canonical JSON and `Content-Type: application/json`, with explicit revision negotiation via `x-agentborn-revision`. Unknown revisions return an error, never downgrade. IDs in the paths below are the exact lowercase IDs/hashes from the schemas. The client rejects redirects and limits response streams; it sends no cookies. Public pages can display pretty JSON separately from committed bytes.

| Method and path | Schema / scope |
| --- | --- |
| GET `/api/v2/discovery` | discovery; public, first bounded page |
| GET `/api/v2/games/{gameId}/versions/{versionHash}` | gameVersion; public immutable bytes |
| GET `/api/v2/events/{eventId}` | opportunity; public proposal versus scheduled status |
| GET `/api/v2/matches/{matchId}` | matchStatus; public lifecycle/outcome/payment projection |
| GET `/api/v2/matches/{matchId}/manifest` | matchManifest; public immutable committed terms |
| GET `/api/v2/matches/{matchId}/registry` | registry bundle; exact versioned documents referenced by the manifest |
| GET `/api/v2/matches/{matchId}/qualification` | qualification; public evidence at the scheduled release, or with cancellation |
| GET `/api/v2/matches/{matchId}/result` | result; public at scheduled release |
| GET `/api/v2/matches/{matchId}/cancellation` | cancellation; public when authorized cancellation completes |
| GET `/api/v2/matches/{matchId}/casual-signal` | casualSignal; public signed free result at scheduled release |
| GET `/api/v2/matches/{matchId}/commitment` | commitmentReceipt; public supplied receipt |
| GET `/api/v2/matches/{matchId}/sealed` | sealedEnvelope; public after commitment |
| GET `/api/v2/matches/{matchId}/studio-package` | replay; matching admitted studio, after commitment finality |
| GET `/api/v2/matches/{matchId}/opening` | opening; public scheduled release |
| GET `/api/v2/matches/{matchId}/replay` | replay; public scheduled release |

The registry bundle contains `version,league,season,tiers,finality,cancellation,selection,assets`, each with its own protocol/revision. It is a container rather than a separately versioned policy. The discovery cursor reserves later pagination support; the alpha client fetches the first page only. Registration, handler authorization, scouting and payment status schemas are exported, but their mutation/administrative routes are A2/A5 integration work. Do not invent active mutation endpoints or consider the alpha client a complete hosted service. Callers authenticate the registry against approved versions, retrieve the manifest and qualification artifacts, then supply them to the verifier. Merely receiving a registry bundle from a server does not establish its approval.

Studio request authentication signs `studioRequestSchema` canonical bytes using Ed25519. Suggested transport is `x-agentborn-request` = unpadded base64url of those bytes and `x-agentborn-signature` = lowercase `0x` signature. Decode to the exact canonical bytes; verify key ID, game ownership/scope, revision, exact uppercase method, exact normalized path, SHA-256 of raw request body, Unix issue time and fresh nonzero nonce. SHA-256 is used only for the HTTP body digest; it is not the commitment hash. GET body digest is SHA-256 of empty bytes. This profile has no signed query string; reject queries/encoded path aliases on authenticated routes. Keys must remain on studio servers.

A2 must configure a bounded clock window and durable nonce uniqueness scoped to credential key ID, retaining nonces at least through the acceptance window; atomically consume a nonce only for an authenticated request. Key rotation/revocation and game suspension are registry operations. A fresh retry signs a new nonce while retaining any mutation's idempotency key. `studioSigningBytes` and `verifyEd25519` do not implement authorization or the nonce store. A signature from the wrong game never authorizes package access. A valid studio signature never authorizes a seed, roster, result, money transfer or cancellation.

Handler signatures follow [EIP-712](https://eips.ethereum.org/EIPS/eip-712), domain `name=AgentBornHandlerV2`, `version=2.0.0-alpha.1`, chain ID and verifying MatchBoard. Primary type in exact order:

```text
HandlerPermissions(bytes32 handlerId,bytes32 championId,bytes32 permissionsHash,
 uint256 version,uint256 nonce,uint64 validAfter,uint64 validUntil)
```

Permissions hash commits the full permission document. Signature validity must be checked against the current authorized controller (including the eventual supported contract-wallet policy), registered handler/champion ownership, domain, current permission version, validity interval and consumed nonce. The untrusted `signer` field is not authority. These are reusable standing settings once registered; register each authorization nonce once and recheck active permission version at each admission, rather than consuming the same signing nonce per match. Revocation/narrowing affects future commitments; it does not revoke locked funds. This package provides digest construction, not controller verification or a wallet integration.

Mutation implementations must bind a persisted idempotency key to actor, operation and canonical request hash. Same key/same bytes returns the original resource/state; same key/different bytes returns `IDEMPOTENCY_CONFLICT`. Registration identity includes immutable game version; match commitment/result identity is match ID and committed hashes; report orders retain one order/report/entitlement across retries. A5 must use outboxes and on-chain state to reconcile ambiguous timeouts, not infer failure and issue another debit. HTTP authentication nonce and financial idempotency identity serve different purposes.

Errors carry protocol/revision, request ID, stable code, bounded public message and retryable flag. Typical mapping: 400 invalid document; 401 unauthorized; 403 forbidden; 404 absent; 409 conflict, unreleased, incomplete roster or reconciling; 422 ineligible/unresolved policy; 426 unsupported revision; 413 limits; 503 chain unavailable. Retryability never grants permission or treats pending money as paid. Avoid private strategy details in error text or logs.

## 7. Conformance and remaining assurance

Run the TypeScript suite and the independent Python verifier against the reviewed fixtures. The latter independently constructs static/dynamic ABI, EIP-712 hashes, source-level payments and refunds, canonical JSON, AES-GCM plaintext and Ed25519 messages. Tests cover malformed encodings, domain tampering, full-roster constraints, unavailable chain checks, wrong recipients, early release, changed ciphertext, free-only signatures and credential isolation.

Contract fuzzing, real game deterministic execution, persistent nonce/idempotency enforcement, actual chain inclusion/finality, adversarial delivery recipients, HTTP server authorization, runtime secret filtering and production migration remain A1–A8/G1–G4 work. Do not describe these fixtures as an audit or proof of a deployed system. See the decision record before enabling a dependent path.
