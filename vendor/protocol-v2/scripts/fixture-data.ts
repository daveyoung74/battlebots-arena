import { PROTOCOL, REVISION, ZERO_ADDRESS, type MatchManifest, type Qualification, type ResultRecord,
  type Replay, type Source, type Opening, type Cancellation } from "../src/schemas.js";
import { hashDocument } from "../src/canonical.js";
import { commitResult, commitSeed, encodeResult, encodeSeed, encodeOutcome, hashResult, handlerAuthorizationHash } from "../src/commitments.js";
import { allocatePrizes, cancellationReturns, sourceAmounts } from "../src/money.js";
import { encryptPayload, ENVELOPE_BYTES } from "../src/sealing.js";
import { type Registry, validateManifest, validatePermissions, validateQualification, validateResult,
  validateReplay, validateCancellation } from "../src/validation.js";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { bytesToHex } from "viem";
import { casualSigningBytes, sha256Bytes, studioSigningBytes } from "../src/auth.js";

export const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
export const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const base = { protocol: PROTOCOL, revision: REVISION };
// Public synthetic vectors, never production configuration, credentials or admitted game artifacts.
export function makeManifest() {
  const version: Registry["version"] = { ...base, gameId: id(1), rulesArtifactHash: id(10),
    strategySchemaHash: id(11), eventSchemaHash: id(12), scoringPolicyHash: id(13),
    runtimeId: "fixture-only", runtimeHash: id(14), rngId: "fixture-only", rngHash: id(15),
    numericSemantics: "integer fixture data; not an admitted simulator", supportedRosters: [4],
    reducedRosterPolicyHash: id(16), placementRules: [
      { qualifiedCount: 2, sharesBps: [6250, 3750] },
      { qualifiedCount: 3, sharesBps: [5000, 3000, 2000] },
      { qualifiedCount: 4, sharesBps: [5000, 3000, 2000] },
    ], limits: { maxEntrants: 4, maxTicks: 1000, maxFuel: "1000000", maxMemoryBytes: 16777216,
      maxEvents: 1000, maxEventBytes: 4096, maxReplayBytes: 1048576, maxSheetBytes: 4096, maxRendererAssetBytes: 1048576 } };
  const registry: Registry = { version,
    league: { ...base, gameId: id(1), leagueId: id(2), authorship: "operator", provenancePolicyHash: id(20) },
    season: { ...base, gameId: id(1), leagueId: id(2), seasonId: id(3), gameVersionHash: hashDocument(version), startsAt: "100", endsAt: "10000" },
    tiers: { ...base, gameId: id(1), leagueId: id(2), version: "1", inheritance: "explicit_only",
      token: { chainId: "4663", token: address(90) }, tokenDecimals: 18,
      tiers: [{ tierId: id(4), quantityBaseUnits: "1000000000000000000", benefits: [{ formats: ["percentage", "bounty"],
        rosterSizes: [4], minAvailablePurseWei: "0", maxAvailablePurseWei: null, minNetEthPrizeWei: "0", maxNetEthPrizeWei: null }] }] },
    finality: { ...base, chainId: "4663", startCheckpoint: "first_finalized_block_at_or_after_start",
      commitmentFinality: "finalized", finalizationFinality: "finalized", extraSettlementDelaySeconds: 10, recoveryDeadlineSeconds: 3600 },
    cancellation: { ...base, disposition: "refund_all", enrollmentDeadlineSeconds: 600, recoveryDeadlineSeconds: 3600 },
    selection: { ...base, version: "1", kind: "audited_draw", provisionalLeaseSeconds: 60, candidateLimit: 100, evidencePolicyHash: id(21) },
    assets: { ...base, standardTransfersOnly: true, assets: [{ chainId: "4663", token: ZERO_ADDRESS }, { chainId: "4663", token: address(91) }] },
  };
  const permissions = Array.from({ length: 4 }, (_, i) => ({ ...base, handlerId: id(200 + i), championId: id(100 + i),
    version: "1", validAfter: "100", validUntil: "10000", paused: false, allowedGames: [id(1)], allowedLeagues: [id(2)],
    allowedFormats: ["percentage", "bounty", "none"] as Array<"percentage" | "bounty" | "none">,
    allowOpen: true, maxSliceBps: 2000, maxContributionWei: "1000000", minimumRemainingWei: "0",
    grossDailyBudgetWei: "1000000", maxMatchesPerDay: 10, minimumMatchIntervalSeconds: 60 }));
  const roster = permissions.map((permission, i) => ({ championId: permission.championId, handlerId: permission.handlerId,
    ownershipSnapshotHash: id(300 + i), payout: address(400 + i), qualifyingWallet: address(500 + i), vault: address(600 + i),
    strategyCommitment: id(700 + i), permissionsHash: hashDocument(permission), authorizationVersion: "1",
    admissionEvidenceHash: id(800 + i), grossDailyUsedWei: "0", dayBucket: "1970-01-01" }));
  const sources: Source[] = [101, 203, 307, 409].map((amount, i) => ({
    sourceId: id(900 + i), contract: address(600 + i), asset: { chainId: "4663", token: ZERO_ADDRESS },
    kind: "vault", championId: roster[i].championId, stage: "roster", reservationRef: id(1000 + i),
    availableAtReservationWei: String(amount * 10), maxSliceBps: 2000, ...sourceAmounts("vault", String(amount)),
  }));
  sources.push({ sourceId: id(910), contract: address(610), asset: { chainId: "4663", token: ZERO_ADDRESS },
    kind: "entry_pot", deposits: roster.map((entry, i) => ({ championId: entry.championId, funder: address(500 + i), amount: "25" })),
    ...sourceAmounts("entry_pot", "100") });
  for (const [i, token, amount] of [[0, ZERO_ADDRESS, "10005"], [1, address(91), "5001"]] as const) {
    sources.push({ sourceId: id(920 + i), contract: address(620 + i), asset: { chainId: "4663", token },
      kind: "sponsor", award: "placement", deposits: [{ depositId: id(1100 + i), funder: address(650 + i), amount }],
      ...sourceAmounts("sponsor", amount) });
  }
  const manifest: MatchManifest = { ...base, chainId: "4663", board: address(50), eventId: id(60), matchId: id(61),
    identity: { gameId: id(1), gameVersionHash: hashDocument(version), leagueId: id(2), seasonId: id(3),
      tierConfigHash: hashDocument(registry.tiers), matchmakingPolicyHash: hashDocument(registry.selection) },
    schedule: { enrollmentClosesAt: "900", startAt: "1000", resultCommitDeadline: "1100", revealAt: "1400",
      settlementNotBefore: "1410", playbackSeconds: 300, finalityPolicyHash: hashDocument(registry.finality) },
    format: { kind: "percentage", entryBps: 1000, minimumWei: "10" }, exposure: "open", capacity: 4, doorFeeWei: "25",
    tierId: id(4), cancellationPolicyHash: hashDocument(registry.cancellation), assetPolicyHash: hashDocument(registry.assets),
    quoteRecordHash: null, settlementFeeBps: 100, treasury: address(51), roster, sources };
  validateManifest(manifest, registry);
  validatePermissions(manifest, permissions, "899");
  return { registry, manifest, permissions };
}

export async function makeOutcome(kind: "played" | "walkover") {
  const { registry, manifest, permissions } = makeManifest();
  if (kind === "walkover") manifest.matchId = id(62);
  const manifestHash = hashDocument(manifest);
  const qualification: Qualification = { ...base, matchId: manifest.matchId, manifestHash,
    checkpoint: { chainId: "4663", number: "100", hash: id(1200), timestamp: "1001", finalityPolicyHash: manifest.schedule.finalityPolicyHash },
    entrants: manifest.roster.map((entry, i) => ({ championId: entry.championId,
      status: kind === "played" || i === 3 ? "qualified" : "no_show",
      reason: kind === "played" || i === 3 ? "qualified" : "token_shortfall", evidenceHash: id(1300 + i) })) };
  const placements = kind === "played" ? [3, 0, 2, 1].map(i => manifest.roster[i].championId) : [manifest.roster[3].championId];
  const sharesBps = kind === "played" ? [5000, 3000, 2000] : [10000];
  const result: ResultRecord = { ...base, matchId: manifest.matchId, manifestHash, kind,
    qualificationHash: hashDocument(qualification), placements, sharesBps, payments: allocatePrizes(manifest, placements, sharesBps) };
  const replay: Replay = { ...base, matchId: manifest.matchId, manifestHash, gameVersionHash: manifest.identity.gameVersionHash,
    eventSchemaHash: registry.version.eventSchemaHash, rendererVersion: "fixture/1", kind, resultHash: hashResult(result),
    visibleRoster: placements.map((championId, i) => ({ championId, name: `Fixture champion ${i + 1}`, cosmeticRef: "fixture" })),
    initialState: { fixtureOnly: true, caption: "Synthetic public conformance data" }, durationMs: kind === "played" ? 2000 : 0,
    events: kind === "played" ? [{ seq: 0, atMs: 1000, type: "action", payload: { actor: placements[0], action: "advance" } },
      { seq: 1, atMs: 2000, type: "finish", payload: { winner: placements[0] } }] : [] };
  const seed = kind === "played" ? id(1400) : null;
  const seedCommitment = seed ? commitSeed(manifest, seed) : `0x${"0".repeat(64)}`;
  // Public, deterministic test material ONLY. Production uses createSealingMaterial once and persists it.
  const key = id(kind === "played" ? 1401 : 1501), nonce = id(kind === "played" ? 1402 : 1502);
  const iv = `0x${(kind === "played" ? "01" : "02").repeat(12)}`;
  const envelope = await encryptPayload(manifest, { result, replay, seed, seedCommitment, nonce }, key, iv);
  const sealedEnvelopeHash = hashDocument(envelope, ENVELOPE_BYTES), replayHash = hashDocument(replay);
  const opening: Opening = { ...base, matchId: manifest.matchId, manifestHash, result,
    replayHash, seed, seedCommitment, nonce, encryptionKey: key, sealedEnvelopeHash };
  const commitmentInput = { resultHash: hashResult(result), replayHash, seedCommitment, sealedEnvelopeHash, nonce };
  const receipt = { ...base, matchId: manifest.matchId, manifestHash, chainId: manifest.chainId, board: manifest.board,
    seedCommitment, resultCommitment: commitResult(manifest, commitmentInput), sealedEnvelopeHash,
    transactionHash: id(1600), block: { ...qualification.checkpoint!, number: "102", hash: id(1202), timestamp: "1050" } };
  validateQualification(manifest, qualification);
  validateResult(manifest, registry.version, qualification, result);
  validateReplay(manifest, registry.version, result, replay);
  return { fixtureOnly: true, registry, manifest, permissions, qualification, result, replay, envelope, opening, receipt,
    vectors: { manifestHash, resultHash: hashResult(result), outcomeAbi: encodeOutcome(result), replayHash, sealedEnvelopeHash, seedCommitment,
      seedAbi: seed ? encodeSeed(manifest, seed) : null, resultAbi: encodeResult(manifest, commitmentInput), resultCommitment: receipt.resultCommitment } };
}

export function makeCancellation() {
  const { registry, manifest } = makeManifest();
  manifest.matchId = id(63);
  const qualification: Qualification = { ...base, matchId: manifest.matchId, manifestHash: hashDocument(manifest),
    checkpoint: { chainId: "4663", number: "100", hash: id(1200), timestamp: "1001", finalityPolicyHash: manifest.schedule.finalityPolicyHash },
    entrants: manifest.roster.map((entry, i) => ({ championId: entry.championId, status: "no_show", reason: "token_shortfall", evidenceHash: id(1300 + i) })) };
  const cancellation: Cancellation = { ...base, matchId: manifest.matchId, manifestHash: hashDocument(manifest),
    phase: "start_checked", reason: "zero_qualified", evidenceHash: id(1700), qualificationHash: hashDocument(qualification),
    cancelledAt: "1002", returns: cancellationReturns(manifest, registry.cancellation.disposition) };
  validateCancellation(manifest, registry.cancellation, cancellation, qualification);
  return { fixtureOnly: true, policyStatus: "example only; adoption tracked in DECISIONS.md", registry, manifest, qualification,
    cancellation, cancellationHash: hashDocument(cancellation) };
}

export function makeAuthorization() {
  const { permissions, manifest } = makeManifest();
  const authorization = { ...base, handlerId: permissions[0].handlerId, championId: permissions[0].championId,
    signer: address(500), board: manifest.board, chainId: manifest.chainId, permissionsHash: hashDocument(permissions[0]),
    version: "1", nonce: "7", validAfter: "100", validUntil: "10000", signature: "0x00" };
  return { fixtureOnly: true, authorization, typedDataHash: handlerAuthorizationHash(authorization) };
}

function testSigningKey() {
  // Publicly reproducible dummy key. Never provision this key in any service or wallet.
  const privateKey = createPrivateKey({ key: Buffer.from(`302e020100300506032b657004220420${"11".repeat(32)}`, "hex"), format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(-32);
  return { publicKey: bytesToHex(publicKey), sign: (bytes: Uint8Array) => bytesToHex(sign(null, bytes, privateKey)) };
}
export async function makeCasual() {
  const fixture = await makeOutcome("played");
  const { registry, manifest, qualification, result, replay } = fixture;
  manifest.matchId = id(64); manifest.sources = []; manifest.format = { kind: "none" };
  manifest.doorFeeWei = "0"; manifest.tierId = null;
  qualification.matchId = manifest.matchId; qualification.manifestHash = hashDocument(manifest); qualification.checkpoint = null;
  result.matchId = manifest.matchId; result.manifestHash = hashDocument(manifest);
  result.qualificationHash = hashDocument(qualification); result.payments = [];
  replay.matchId = manifest.matchId; replay.manifestHash = hashDocument(manifest); replay.resultHash = hashResult(result);
  validateManifest(manifest, registry); validateResult(manifest, registry.version, qualification, result);
  const keys = testSigningKey(), seed = id(1800);
  const signal = { ...base, kind: "casual_result" as const, keyId: id(1801), matchId: manifest.matchId,
    manifestHash: hashDocument(manifest), resultHash: hashResult(result), replayHash: hashDocument(replay),
    seedCommitment: commitSeed(manifest, seed), publishedAt: "1400", signature: `0x${"00".repeat(64)}` };
  signal.signature = keys.sign(casualSigningBytes(signal));
  return { fixtureOnly: true, registry, manifest, qualification, result, replay, seed, signal, publicKey: keys.publicKey,
    signedMessageHex: bytesToHex(casualSigningBytes(signal)) };
}
export async function makeStudioRequest() {
  const keys = testSigningKey();
  const request = { ...base, kind: "studio_request" as const, keyId: id(1801), gameId: id(1), method: "GET" as const,
    path: `/api/v2/matches/${id(61)}/studio-package`, bodySha256: await sha256Bytes(new Uint8Array()), issuedAt: "1100", nonce: id(1900) };
  const bytes = studioSigningBytes(request);
  return { fixtureOnly: true, request, publicKey: keys.publicKey, signature: keys.sign(bytes), signedMessageHex: bytesToHex(bytes) };
}
