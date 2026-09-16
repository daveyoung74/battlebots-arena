# A0 decisions and activation gates

This record distinguishes accepted product behavior, the alpha encoding, and later launch configuration. The owner accepted the Pons recommendations and proposed A1 safeguards on 2026-09-12, and required the scout surcharge baseline to be defined in the admin panel. Acceptance is recorded below; a fixture alone does not approve a policy.

## Accepted behavior carried forward

- AgentBorn selects and commits the complete roster, chooses the seed, simulates, referees, publishes and resolves the match. Studio access is for presentation.
- Each handler enters at most one owned champion; a champion has one queue/active match across all games. All configured seats must be eligible and available before atomic entrant commitment.
- Purse funding share is adjustable from 20% to 100%. Match exposure is a different control, capped at 20% with narrower handler permissions. Percentage minima are eligibility tests, not top-ups. Featured bounties can admit zero-contribution challengers.
- Completed matches and walkovers allocate a 1% fee separately on each vault source and entry pot. Sponsored prizes, including ETH, are exempt. Fees are floored before net prize allocation; rounding remainder goes to first place.
- A genuine start-check token shortfall forfeits the locked contribution in a valid outcome. Unknown infrastructure data does not establish a no-show. One qualifier takes all net prizes.
- A changed Pons fee recipient stops future replenishment through that route. It does not confiscate existing funds, invalidate commitments, or independently block paid admission while funds remain sufficient. Free and otherwise eligible zero-contribution matches remain available.
- Results are committed before studio access. Studios may infer the ending early. A public scheduled opening is the official signal; payment submission follows publication, finality and the agreed delay. Playback progress and viewer presence do not control settlement.
- Scouting purchases require individual human approval. Included subscription reports do not compensate a handler; failed fulfillment retries the same paid or included entitlement.

## Runtime architecture corrected 2026-09-13

The owner clarified both execution boundaries:

- GrokBots run outside AgentBorn and connect through OAuth-authorized MCP to manage the handler's selected champions. Extend the existing MCP/OAuth services and grants; do not host bot inference, collect model API keys or build inference pass-through billing. Connection/submission provenance does not prove which external model generated a strategy. Disconnect/revocation blocks future bot actions without cancelling a locked match.
- AgentBorn builds and runs its own custom TypeScript simulation engine. Operators supply rules data for that engine to validate and interpret. AgentBorn does not execute their game artifacts, source modules, plugins or binaries. G1 provides rules documents and fixtures; A3 owns the engine and its supported rules vocabulary, deterministic behavior and operation limits.

The existing alpha field `rulesArtifactHash` refers to the rules-data document hash, while `runtimeId`/`runtimeHash` identify AgentBorn's engine. These corrections do not change wire encoding or existing commitment vectors. Any later field rename must be versioned explicitly. A2 stores rule/engine identity and external-agent authorization provenance; A3/G1 must freeze the rules format before building the game mechanics.

## Engineering choices in this alpha revision

Restricted canonical JSON for artifacts; Keccak-256 for document hashes; Solidity ABI for the financial outcome and outer commitments; EIP-712 for handler permission authorizations; Ed25519 for studio HTTP requests and free AgentBorn results; AES-256-GCM for sealed payloads. Exact encodings and vectors are in the spec and fixtures.

The schedule uses a fixed commitment deadline, playback allowance, public reveal and earliest settlement. An unrecoverable missed deadline is explicit exceptional recovery; workers cannot move the clock opportunistically. Finality and storage readiness must be established before studio delivery. Actual durations and operational recovery rules are configuration gates for A5/A8.

Supported sponsor assets must have standard transfer behavior and be explicitly approved. Ordinary purse and entry-pot contributions use native ETH. USD quote terms remain rejected until their valuation policy and encoding are approved. The schema reserves a quote reference without enabling it.

## A1 decisions accepted 2026-09-12

| Decision | Adopted implementation |
| --- | --- |
| Pons sweep/conversion dependency | Accept and monitor it. Pending upstream proceeds are displayed separately; only received/accounted ETH funds entry. An outage does not freeze existing purse funds or committed prizes. |
| Vested buyback FanCoin | As the champion's FanCoin becomes releasable, recover it through the authorized sink and deliver 100% to the handler's fixed payout wallet. Keep failed deliveries as fixed token liabilities. No purse split or automatic selling of these tokens; ETH receipts retain the 20–100% purse split. |
| Exceptional whole-match cancellation | Adopt `refund_all`, including entrants already classified as no-shows. Release vault reservations inside the original vault and return entry/sponsor deposits to their original funders, without a fee. Completed matches and walkovers retain no-show forfeiture. |
| Later buyback controls | Keep the launch-time choice. The controller's only sink setting remains the bounded funding split; no later buyback toggle, recipient change, arbitrary call or withdrawal is added. |
| Escrow receipt classification | Allocate the measured new ETH received from the fixed escrow using the current funding split, including unsolicited credits aggregated there. Record it as an escrow receipt, without claiming all of it came from trading. Direct unaccounted sink donations are not new allocations; neither source can resplit liabilities or bypass match sponsorship rules. Only the bound FanCoin uses the token-delivery path above; unsupported assets remain outside spendable purse accounting. |
| Controller authority for the first implementation | Preserve the fixed mint-time controller/payout destinations and omit controller rotation, ownership transfer and recovery powers. A later supported transfer/recovery design must be separately specified; it is not a reason to add an administrator withdrawal path. A2 must still establish the registered handler's wallet linkage before admission. |
| Scout surcharge baseline | Admin → Platform owns `scouting.baselineSurchargeBps`, from 0 to 10000 (0–100%). Unset means new paid quotes require configuration; explicit zero means no surcharge. No implicit 20% rate. Persist the selected rate and exact amounts with each manually approved quote; admin changes affect future quotes only. Included reports create no handler payment or surcharge. |

These decisions clear the listed product blockers for implementing A1. Contract verification, deployment review and feature-specific configuration remain required. The accepted cancellation behavior already matches the alpha fixture and validator; no wire bytes change here.

## Later feature configuration and integration

### Per-game Training Grounds adopted 2026-09-14

Every champion must complete seven elapsed days of Training Grounds in each stable game before funded competition. The initial clock starts at the first completed, validated, actually played free training match for that champion/game, and expires exactly 604800 seconds later. A different game starts a separate clock; seasons, leagues and competitive-version updates within the same game retain progress. Progress is champion-scoped rather than handler-scoped, without adding any new transfer or controller-rotation power.

This requirement is a paid-rollout gate. Package release `2.0.0-alpha.2` implements the separate [`a0.training.1` evidence extension](TRAINING.md) for review while preserving historical `2.0.0-alpha.1` match/result bytes. It composes ordinary admission and training evidence in the existing manifest slots. Initial enforcement follows AgentBorn's trusted-referee model: A2/A4 authenticate training history and enforce time before admission/signing; the contract binds the manifest but does not independently count seven days. The migration/activation boundary is specified, with implementation still required. A6 and the sample client should show the authoritative countdown/date without promising seats or spending consent. Local exhibitions, canceled matches, no-shows, walkovers and unverified studio reports do not establish eligibility.

“Seven days or X validated matches” and individually approved paid early access are future options, disabled initially. No X, price, recipient/revenue split or refund policy is selected yet. Count valid training results so a later policy can use that history, but do not enable an implicit bypass. Application, contract-boundary, outcome, UI and sample work is tracked in the [training implementation handoff](../../docs/TRAINING_GROUNDS_IMPLEMENTATION.md).

### Initial seat priority accepted 2026-09-13

The owner selected **queue arrival order** for initial server-driven seat selection. Record arrival on AgentBorn, use an increasing server sequence for deterministic ties, and select the earliest eligible candidates for each event. Rejoining after withdrawal receives a new position. A featured champion with an already locked bounty retains its required seat; other seats follow queue order. Current fixtures remain conformance examples and do not select the production policy.

| Choice | Proposed direction / evidence | Blocks |
| --- | --- | --- |
| Excess-candidate selection | Queue arrival order accepted above. Implement versioned server arrival/selection evidence and revalidation; an audited draw remains an unactivated fixture example. | A2 seat assignment implementation |
| Tier inheritance and actual benefits | Config encodes explicit-only or cumulative eligibility, token base-unit thresholds and one or more benefits. Select actual configurations; do not install fixture tiers. | A2 gated events |
| Multi-entrant sample and reduced-roster rules | Current public sample is a duel. Fixture 50/30/20 and two-player 62.5/37.5 shares are examples only. G1 must supply a real admitted game version. | G1 and paid sample mode |
| Handler identity linkage | A2 must establish trustworthy handler grouping and wallet linkage before admission. Transfers and controller recovery are excluded from the first contract implementation as recorded above. | A2 admission |
| USD quotes, finality/delays, runtime/verification budgets, retention, sponsored-token list | Explicitly version and approve for the path being enabled. | A3/A4/A5/A8 |
| Scout setup and subscription quantities/reset/rollover | Admin sets the surcharge baseline; A7 snapshots it into approved orders. Configure plan quantities and period rules before entitlement activation. No bot spending delegation. | A6/A7 |

A1 can now implement the accepted money paths against this revision. Keep later feature configurations explicit and disabled until configured; do not replace approval of the contract implementation with approval of these product decisions. Regenerate vectors only if the wire contract changes.
