import { z } from "zod";
import { canonicalJson, hashDocument, parseDocument } from "./canonical.js";
import { allocatePrizes, assertExposure, cancellationReturns, contribution, sourceAmounts, spendingLimits } from "./money.js";
import { hashResult } from "./commitments.js";
import { assetPolicySchema, cancellationPolicySchema, cancellationSchema, finalityPolicySchema,
  gameVersionSchema, leagueSchema, matchManifestSchema, permissionSchema, qualificationSchema,
  replaySchema, resultSchema, seasonSchema, selectionPolicySchema, tierConfigSchema,
  LIMITS, ZERO_ADDRESS, type MatchManifest, type GameVersion, type Qualification } from "./schemas.js";

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INVALID_DOCUMENT: ${message}`);
}
function unique(values: string[], label: string) { invariant(new Set(values).size === values.length, `duplicate ${label}`); }
function equal(actual: unknown, expected: unknown, label: string) {
  invariant(canonicalJson(actual) === canonicalJson(expected), label);
}
export const registrySchema = z.strictObject({ version: gameVersionSchema, league: leagueSchema,
  season: seasonSchema, tiers: tierConfigSchema, finality: finalityPolicySchema,
  cancellation: cancellationPolicySchema, selection: selectionPolicySchema, assets: assetPolicySchema });
export type Registry = z.infer<typeof registrySchema>;

export function validateGameVersion(raw: unknown): GameVersion {
  const game = parseDocument(gameVersionSchema, raw);
  unique(game.supportedRosters.map(String), "supported roster");
  unique(game.placementRules.map(rule => String(rule.qualifiedCount)), "placement rule");
  invariant(game.supportedRosters.every(size => size <= game.limits.maxEntrants), "roster exceeds game limits");
  const max = Math.max(...game.supportedRosters);
  for (let n = 2; n <= max; n++) {
    const rule = game.placementRules.find(rule => rule.qualifiedCount === n);
    invariant(rule && rule.sharesBps.length <= n && rule.sharesBps.reduce((a, b) => a + b, 0) === 10000,
      `missing or invalid reduced-roster placement rule for ${n}`);
  }
  invariant(game.placementRules.every(rule => rule.qualifiedCount <= max), "unused placement rule");
  return game;
}

/** Pure structural/accounting check against a caller-supplied trusted registry, not proof of admission. */
export function validateManifest(raw: unknown, rawRegistry: unknown): MatchManifest {
  const manifest = parseDocument(matchManifestSchema, raw);
  const registry = parseDocument(registrySchema, rawRegistry);
  const game = validateGameVersion(registry.version), identity = manifest.identity, schedule = manifest.schedule;
  invariant(identity.gameVersionHash === hashDocument(game), "game version hash");
  invariant(identity.gameId === game.gameId && identity.gameId === registry.league.gameId &&
    identity.gameId === registry.season.gameId && identity.gameId === registry.tiers.gameId, "game relationship");
  invariant(identity.leagueId === registry.league.leagueId && identity.leagueId === registry.season.leagueId &&
    identity.leagueId === registry.tiers.leagueId, "league relationship");
  invariant(identity.seasonId === registry.season.seasonId && identity.gameVersionHash === registry.season.gameVersionHash,
    "season relationship/version");
  invariant(identity.tierConfigHash === hashDocument(registry.tiers), "tier configuration hash");
  unique(registry.tiers.tiers.map(tier => tier.tierId), "tier ID");
  invariant(registry.tiers.token.token !== ZERO_ADDRESS, "holding tiers require a token");
  for (const tier of registry.tiers.tiers) for (const benefit of tier.benefits) {
    unique(benefit.formats, "tier format");
    unique(benefit.rosterSizes.map(String), "tier roster size");
    invariant(benefit.maxAvailablePurseWei === null || BigInt(benefit.maxAvailablePurseWei) >= BigInt(benefit.minAvailablePurseWei), "tier purse interval");
    invariant(benefit.maxNetEthPrizeWei === null || BigInt(benefit.maxNetEthPrizeWei) >= BigInt(benefit.minNetEthPrizeWei), "tier prize interval");
  }
  unique(registry.assets.assets.map(asset => `${asset.chainId}:${asset.token}`), "approved asset");
  invariant(identity.matchmakingPolicyHash === hashDocument(registry.selection), "selection policy hash");
  invariant(schedule.finalityPolicyHash === hashDocument(registry.finality), "finality policy hash");
  invariant(manifest.cancellationPolicyHash === hashDocument(registry.cancellation), "cancellation policy hash");
  invariant(manifest.assetPolicyHash === hashDocument(registry.assets), "asset policy hash");
  invariant(BigInt(registry.season.startsAt) <= BigInt(schedule.startAt) && BigInt(schedule.startAt) < BigInt(registry.season.endsAt), "season timing");
  invariant(BigInt(schedule.enrollmentClosesAt) < BigInt(schedule.startAt) &&
    BigInt(schedule.startAt) <= BigInt(schedule.resultCommitDeadline), "enrollment/start deadline order");
  invariant(schedule.playbackSeconds > 0 && BigInt(schedule.revealAt) >=
    BigInt(schedule.resultCommitDeadline) + BigInt(schedule.playbackSeconds), "insufficient playback allowance");
  invariant(BigInt(schedule.settlementNotBefore) >= BigInt(schedule.revealAt) +
    BigInt(registry.finality.extraSettlementDelaySeconds), "settlement before reveal/delay");
  invariant(manifest.roster.length === manifest.capacity && game.supportedRosters.includes(manifest.capacity), "ROSTER_INCOMPLETE or unsupported roster");
  unique(manifest.roster.map(entry => entry.championId), "champion");
  unique(manifest.roster.map(entry => entry.handlerId), "handler");
  unique(manifest.roster.flatMap(entry => entry.vault ? [entry.vault] : []), "vault binding");
  unique(manifest.sources.map(source => source.sourceId), "source ID");
  unique(manifest.sources.map(source => `${source.contract}:${source.asset.token}`), "source contract/asset");
  const roster = new Map(manifest.roster.map(entry => [entry.championId, entry]));
  const vaults = manifest.sources.filter(source => source.kind === "vault");
  unique(vaults.map(source => source.championId), "vault contribution");
  invariant(vaults.length === 0 || manifest.capacity >= 4, "vault admission requires at least four champions");
  invariant(manifest.sources.filter(source => source.kind === "entry_pot").length <= 1, "multiple entry pots");
  const funded = manifest.sources.length > 0;
  if (manifest.contributionAsset) invariant(manifest.contributionAsset.chainId === manifest.chainId && registry.assets.assets.some(a => canonicalJson(a) === canonicalJson(manifest.contributionAsset)), "unapproved contribution currency");
  for (const entry of manifest.roster) if (entry.winnings) invariant(entry.vault && entry.winnings.splitter !== entry.payout && entry.winnings.splitter !== entry.vault, "distinct winnings destinations");
  unique(manifest.roster.flatMap(entry => entry.winnings ? [entry.winnings.splitter] : []), "winnings splitter");
  invariant(!funded || registry.cancellation.disposition !== "unresolved", "UNRESOLVED_POLICY: cancellation");
  invariant(registry.selection.kind !== "unresolved", "UNRESOLVED_POLICY: seat selection");
  invariant(manifest.quoteRecordHash === null, "UNRESOLVED_POLICY: USD quote terms are not enabled by this revision");
  if (!funded) invariant(manifest.tierId === null && manifest.format.kind === "none" && manifest.doorFeeWei === "0" && (manifest.contributionAsset?.token ?? ZERO_ADDRESS) === ZERO_ADDRESS, "free casual cannot require holdings or purse");
  if (manifest.tierId !== null) invariant(registry.tiers.tiers.some(tier => tier.tierId === manifest.tierId), "unknown tier");
  for (const source of manifest.sources) {
    invariant(source.asset.chainId === manifest.chainId && registry.assets.assets.some(asset =>
      asset.chainId === source.asset.chainId && asset.token === source.asset.token), "unapproved asset");
    const expected = sourceAmounts(source.kind, source.grossAmount);
    invariant(source.feeAmount === expected.feeAmount && source.netAmount === expected.netAmount, "source fee/net mismatch");
    invariant(source.kind === "sponsor" || source.asset.token === (manifest.contributionAsset?.token ?? ZERO_ADDRESS), "ordinary prize asset must match contribution currency");
    if (source.kind === "vault") {
      const entrant = roster.get(source.championId);
      invariant(entrant && entrant.vault === source.contract, "vault/champion binding");
      invariant(source.grossAmount === contribution(manifest.format, source.championId, source.availableAtReservationWei), "wrong format contribution");
      invariant(BigInt(source.grossAmount) <= BigInt(source.availableAtReservationWei) * BigInt(source.maxSliceBps) / BigInt(10000), "immutable exposure ceiling");
      invariant(source.stage !== "proposal" || manifest.format.kind === "bounty", "only featured bounty may be reserved before roster");
    } else {
      invariant(source.deposits.reduce((sum, deposit) => sum + BigInt(deposit.amount), BigInt(0)) === BigInt(source.grossAmount), "deposit conservation");
      if (source.kind === "entry_pot") {
        unique(source.deposits.map(deposit => deposit.championId), "door-fee deposit");
        invariant(source.deposits.length === manifest.capacity && manifest.doorFeeWei !== "0", "entry pot must cover complete roster");
        for (const deposit of source.deposits) invariant(roster.has(deposit.championId) && deposit.amount === manifest.doorFeeWei, "door-fee amount/member");
      } else {
        unique(source.deposits.map(deposit => deposit.depositId), "sponsor deposit ID");
        invariant(!manifest.roster.some(entry => entry.vault === source.contract), "sponsor cannot relabel a roster vault");
      }
    }
  }
  invariant((manifest.doorFeeWei === "0") === !manifest.sources.some(source => source.kind === "entry_pot"), "missing/unexpected entry pot");
  if (manifest.format.kind === "none") invariant(vaults.length === 0, "untagged format with purse source");
  else if (manifest.format.kind === "bounty") invariant(vaults.length === 1 && vaults[0].championId === manifest.format.championId,
    "bounty must have exactly its featured vault");
  else invariant(vaults.length === manifest.capacity, "every roster member must contribute its purse");
  return manifest;
}

export function validatePermissions(manifest: MatchManifest, rawPermissions: unknown[], now: string): void {
  const permissions = rawPermissions.map(raw => parseDocument(permissionSchema, raw));
  unique(permissions.map(permission => permission.championId), "permission champion");
  invariant(permissions.length === manifest.capacity, "missing permissions");
  for (const entry of manifest.roster) {
    const permission = permissions.find(permission => permission.championId === entry.championId);
    invariant(permission && permission.handlerId === entry.handlerId && hashDocument(permission) === entry.permissionsHash &&
      permission.version === entry.authorizationVersion, "permission binding");
    invariant(!permission.paused && BigInt(permission.validAfter) <= BigInt(now) && BigInt(now) < BigInt(permission.validUntil), "inactive permissions");
    invariant(permission.allowedGames.includes(manifest.identity.gameId) && permission.allowedLeagues.includes(manifest.identity.leagueId) &&
      permission.allowedFormats.includes(manifest.format.kind) && (manifest.exposure !== "open" || permission.allowOpen), "event outside handler permissions");
    const source = manifest.sources.find(source => source.kind === "vault" && source.championId === entry.championId);
    if (source?.kind === "vault") assertExposure({ contributionWei: source.grossAmount,
      availableWei: source.availableAtReservationWei, maxSliceBps: Math.min(source.maxSliceBps, permission.maxSliceBps),
      ...spendingLimits(permission, manifest.contributionAsset?.token ?? ZERO_ADDRESS), grossDailyUsedWei: entry.grossDailyUsedWei });
  }
  // Ownership, fresh balances, wallet signatures, daily frequency and exclusive leases are A2/A4 checks.
}

export function validateQualification(manifest: MatchManifest, raw: unknown): Qualification {
  const record = parseDocument(qualificationSchema, raw);
  invariant(record.matchId === manifest.matchId && record.manifestHash === hashDocument(manifest), "qualification identity");
  if (record.checkpoint) invariant(record.checkpoint.chainId === manifest.chainId &&
    record.checkpoint.finalityPolicyHash === manifest.schedule.finalityPolicyHash &&
    BigInt(record.checkpoint.timestamp) >= BigInt(manifest.schedule.startAt), "start checkpoint context");
  else invariant(manifest.sources.length === 0 && manifest.tierId === null, "funded/holding check requires a chain checkpoint");
  unique(record.entrants.map(entry => entry.championId), "qualification entrant");
  equal([...record.entrants.map(entry => entry.championId)].sort(), [...manifest.roster.map(entry => entry.championId)].sort(), "qualification roster");
  for (const entry of record.entrants) invariant(
    (entry.status === "qualified" && entry.reason === "qualified") ||
    (entry.status === "no_show" && ["token_shortfall", "explicit_abandonment"].includes(entry.reason)) ||
    (entry.status === "unknown" && entry.reason === "infrastructure_unavailable"), "qualification reason/status");
  invariant(manifest.tierId !== null || record.entrants.every(entry => entry.reason !== "token_shortfall"), "no token-shortfall penalty without a holding gate");
  return record;
}

export function validateResult(manifest: MatchManifest, game: GameVersion, qualification: Qualification, raw: unknown) {
  const record = parseDocument(resultSchema, raw);
  validateQualification(manifest, qualification);
  invariant(hashDocument(game) === manifest.identity.gameVersionHash, "result game version");
  invariant(record.matchId === manifest.matchId && record.manifestHash === hashDocument(manifest) &&
    record.qualificationHash === hashDocument(qualification), "result identity/evidence");
  invariant(qualification.entrants.every(entry => entry.status !== "unknown"), "unknown checkpoint cannot produce outcome");
  const qualified = qualification.entrants.filter(entry => entry.status === "qualified").map(entry => entry.championId);
  invariant(qualified.length > 0, "zero qualified must use cancellation policy");
  unique(record.placements, "placement");
  equal([...record.placements].sort(), [...qualified].sort(), "placements must be all and only eligible starters");
  if (qualified.length === 1) {
    invariant(record.kind === "walkover", "sole qualifier must be walkover");
    equal(record.sharesBps, [10000], "walkover shares");
  } else {
    invariant(record.kind === "played", "multiple qualifiers require admitted game play");
    equal(record.sharesBps, game.placementRules.find(rule => rule.qualifiedCount === qualified.length)?.sharesBps,
      "placement shares differ from committed game rule");
  }
  equal(record.payments, allocatePrizes(manifest, record.placements, record.sharesBps), "fixed-beneficiary payment allocation mismatch");
  return record;
}

export function validateReplay(manifest: MatchManifest, game: GameVersion, result: ReturnType<typeof validateResult>, raw: unknown) {
  const replay = parseDocument(replaySchema, raw, Math.min(game.limits.maxReplayBytes, LIMITS.replayBytes));
  invariant(replay.matchId === manifest.matchId && replay.manifestHash === hashDocument(manifest) &&
    replay.gameVersionHash === manifest.identity.gameVersionHash && replay.eventSchemaHash === game.eventSchemaHash &&
    replay.resultHash === hashResult(result) && replay.kind === result.kind, "replay identity");
  unique(replay.visibleRoster.map(entry => entry.championId), "visible entrant");
  equal([...replay.visibleRoster.map(entry => entry.championId)].sort(), [...result.placements].sort(), "replay eligible roster");
  invariant(replay.events.length <= game.limits.maxEvents && replay.durationMs <= manifest.schedule.playbackSeconds * 1000, "replay limit");
  invariant(result.kind !== "walkover" || (replay.events.length === 0 && replay.durationMs === 0), "walkover cannot invent simulation");
  let previousTime = 0;
  replay.events.forEach((event, index) => {
    invariant(event.seq === index && event.atMs >= previousTime && event.atMs <= replay.durationMs, "event sequence/time");
    canonicalJson(event, game.limits.maxEventBytes);
    previousTime = event.atMs;
  });
  return replay;
}

export function validateCancellation(manifest: MatchManifest, rawPolicy: unknown, raw: unknown, qualification?: Qualification) {
  const policy = parseDocument(cancellationPolicySchema, rawPolicy), record = parseDocument(cancellationSchema, raw);
  invariant(record.matchId === manifest.matchId && record.manifestHash === hashDocument(manifest) &&
    manifest.cancellationPolicyHash === hashDocument(policy), "cancellation identity/policy");
  if (qualification) {
    validateQualification(manifest, qualification);
    invariant(record.qualificationHash === hashDocument(qualification), "cancellation qualification hash");
  } else invariant(record.qualificationHash === null && record.reason !== "zero_qualified", "missing cancellation evidence");
  if (record.reason === "zero_qualified") invariant(record.phase === "start_checked" && qualification?.entrants.every(entry => entry.status === "no_show"), "zero-qualified evidence required");
  if (record.reason === "simulation_unrecoverable") invariant(["seeded", "simulated"].includes(record.phase), "simulation cancellation phase");
  if (record.reason === "opening_unrecoverable") invariant(record.phase === "result_committed", "opening cancellation phase");
  if (qualification?.checkpoint) invariant(BigInt(record.cancelledAt) >= BigInt(qualification.checkpoint.timestamp), "cancellation precedes evidence");
  if (record.reason === "commitment_deadline_missed") invariant(BigInt(record.cancelledAt) > BigInt(manifest.schedule.resultCommitDeadline), "deadline not missed");
  equal(record.returns, cancellationReturns(manifest, policy.disposition), "cancellation returns must preserve funders and charge no fee");
  // A1/A5 must establish current lifecycle, cancellation authority and evidence truth.
  return record;
}
