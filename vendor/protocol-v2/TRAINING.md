# Training evidence extension — a0.training.1

This is the A0 interface for the mandatory per-game seven-day Training Grounds period. Package release `2.0.0-alpha.2` adds this evidence extension. Existing match, result, replay, signature and commitment documents retain wire revision `2.0.0-alpha.1`; their schemas and historical vectors are unchanged. The extension is opt-in for development and required before production funded admission. It does not enable training ingestion, paid matchmaking, an endpoint or a countdown UI.

## Policy

`INITIAL_TRAINING_POLICY` has its own canonical hash. Progress belongs to the permanent champion/game pair. Its first authoritative, validated, actually played free training completion starts the clock. Eligibility begins exactly 604800 seconds later, using integer UTC seconds. A different game starts another clock; changing handler, season, league or competitive version within the same game retains progress. Other admission rules still apply.

The initial schema accepts only seven elapsed days, `matchCountAlternative: null` and `paidEarlyAccess: false`. Unknown fields and other revisions fail. Validated counts are retained for a possible later policy; even a large count does not shorten the initial period. Paid early access requires a separately adopted payment policy and revision. No spending delegation is added.

All funded competition requires training, including entry-only and sponsor-only prize events. Free unfunded play remains available. Becoming eligible is an advertised milestone, not a seat allocation or permission to spend.

## Completion and history authority

`trainingCompletionFromResult` checks existing manifest, registry, qualification and result relationships, requires free/unfunded play, and requires the champion to have participated in a played result. No-show, walkover, cancellation, nonparticipant, funded-result and early-timestamp inputs cannot produce a qualifying record. It records champion/game identity, played game version, match/manifest/qualification/result hashes, completion time and an evidence reference.

This helper checks supplied content. It **does not authenticate an operator, registry, completion time or simulation**. A3/A5 must first verify approved game/rules identity, authoritative session origin, actual completed execution, result and completion timestamp, then archive immutable verification evidence binding those facts. Local demos and arbitrary studio claims cannot enter that path. A result hash, successful parse or `matches_supplied_receipt` assurance is insufficient. Existing casual signatures authenticate publication time and content; they do not authenticate a separately supplied earlier `completedAt`. Do not backdate from them or from champion creation.

A progress record contains the first completion, validated count, champion/game identity, common chain checkpoint and immutable history-evidence reference. A zero count requires a null first completion, and a positive count requires one in the same scope. Completion cannot be later than the snapshot; the eligibility timestamp must fit uint64. `validateTrainingProgress` checks these relationships, not history completeness or canonicality.

`summarizeTrainingHistory` is a bounded reference reducer for an authenticated, complete supplied history. Identical duplicate match records count once. Conflicting records fail; reordering does not move the earliest completion. Equal completion timestamps use ascending match ID as a deterministic tie-breaker. Its 1024-record input limit and document-byte limit bound a single call, not a champion's lifetime. A2 must persist unique champion/game/match records and compute the first record and count across all history without truncation to this helper's input limit. Incomplete history must remain unavailable, not an empty history or an old successful status.

History verification must be current at the requested checkpoint. Reorgs, conflicting source records and recovery uncertainty close funded admission until resolved. The pure package accepts caller-supplied approved facts; the application must supply that authority and consistency.

## Eligibility and display

`evaluateTrainingEligibility` returns `unavailable`, `not_started`, `training` or `eligible`, with policy/progress hashes, evaluation time, first completion time, exact eligibility time and remaining whole seconds. Missing progress means unavailable; an authenticated zero-count record means not started. Both have null eligibility dates/countdowns. A started champion has `remainingSeconds = max(0, purseEligibleAt - evaluatedAt)`.

Display evaluation may use a later UI clock than the supplied snapshot, but cannot evaluate before it. A displayed `eligible` status is not admission authority. Recompute received decisions from their policy and authenticated progress rather than trusting a standalone status string. Future API/MCP and countdown surfaces must refresh unavailable/reorged evidence before any money action.

## Binding a funded roster

The extension composes the existing `roster[].admissionEvidenceHash` slot without changing signed schemas. For a newly assembled roster:

1. Authenticate ordinary A2/A4 admission evidence and training history for each entrant. Obtain fresh admission revalidation and progress at the same approved finalized checkpoint. Independently pin the training policy. Confirm the checkpoint is fresh/canonical, on the manifest chain, under its finality policy, and before enrollment closes.
2. Compute `trainingManifestContextHash`: canonical hash of `{ protocol: "agentborn/2", revision: "a0.training.1", kind: "training_manifest_context", manifest }`, replacing **every** roster admission-evidence hash with the zero hash. All other fields, sources, entrants, payout addresses, rules identity and schedule remain bound. Zeroing these slots avoids a circular hash.
3. Create each `training_admission` with champion/game identity, context hash, policy hash, checkpoint, original ordinary admission-evidence hash, fresh `revalidationEvidenceHash` and progress hash. Every entrant must already be eligible at this checkpoint. Put its canonical hash into that entrant's manifest evidence slot.
4. Persist the final manifest and `training_admission_bundle`, containing its hash, policy, checkpoint and one admission/progress pair in exact roster order. Missing, duplicate or reordered entrants fail. Archive the referenced ordinary evidence, history and completion proofs too.

`bindTrainingAdmissions` checks and returns this composition without mutating input. `validateTrainingAdmissionBundle` checks it against an **independently supplied** policy hash and checkpoint. Both reject incomplete training; no boolean can waive it. Only funded manifests use this bundle; free matches do not require a made-up first training result.

For an early featured reservation, the ordinary evidence hash retains the original immutable admission snapshot; the revalidation hash binds the fresh observation at the common commitment checkpoint. They may be the same document for a newly selected entrant. A2/A4 must compare the archived original entrant/source terms after unwrapping the ordinary hash, preserving all original identities, permission versions, usage, amounts and reservation references. Do not overwrite the old snapshot or imply it was taken at the later checkpoint.

These helpers check content consistency. A2/A4 must load and authenticate every ordinary evidence, revalidation and history reference. Current readers expect the older evidence meaning and are not automatically extension-aware. Do not pass a bundle into them and assume it was checked. The future adapter must verify all components and the final composed manifest before signing or accepting a roster receipt.

## Contract boundary and activation

The initial implementation direction uses AgentBorn's existing trusted-referee model: admission and the signing gateway enforce time and authenticated history. The contract commits the final manifest hash, thereby binding composed evidence, but does **not** independently calculate seven days or authenticate a first-training attestation. No bytecode or ABI changes are included. A compromised authorized referee remains within the existing contract trust boundary. On-chain timestamp enforcement would require a separately reviewed attestation design, authorized registrar and contract upgrade; it is not claimed here.

Before activation, A2 must pin the policy to new events, ingest verified outcomes idempotently and enforce eligibility before queue selection, provisional seats, featured-champion reservations, entry spending and atomic commitment. Early reservations still need the authoritative per-champion decision before any full roster exists. A4 must require composed evidence in preparation, pre-signing revalidation and receipt reconstruction. A5 must verify completion provenance and publish status; A6 and G2/G4 consume it.

Preserve signed manifests, intents, receipts, payments and hashes. Do not rewrite old evidence slots or reinterpret old records as training-approved. In-flight events retain exact terms needed for reconciliation, cancellation and payment recovery. Keep new funded admission paused until every entry/signing path enforces the policy; resolve old open proposals through adopted recovery rules before switching admission profiles. Never grandfather based on mint date or convert an unready champion into a paid no-show. Historical backfill requires independently verified source/time records. Release configuration and migration tests must make this boundary explicit.

## Public vectors and tests

`fixtures/training.json` contains synthetic completions, an ordinary future manifest, composed funded manifest, evidence bundle and one-second-before/exact/one-second-after eligibility vectors. These are unverified examples with no live game, wallet or history authority. `schemas/training.schema.json` is structural; cross-document and authority requirements also apply. `npm run fixtures:training` regenerates only the new files.

TypeScript tests cover bypasses, boundary/overflow, unavailable history, duplicate/conflicting/reordered records, game isolation and continuity, invalid outcomes, funding formats, roster coverage, common checkpoints and tampering after outer hashes are recomputed. Python independently calculates the new hashes, composition and clock boundaries alongside historical signature/commitment/payment vectors.
