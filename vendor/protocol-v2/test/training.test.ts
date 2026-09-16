import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bindTrainingAdmissions, evaluateTrainingEligibility, hashDocument, INITIAL_TRAINING_POLICY,
  summarizeTrainingHistory, trainingCompletionFromResult, trainingManifestContextHash, trainingPolicySchema,
  validateTrainingAdmissionBundle, validateTrainingProgress, ZERO_HASH, type MatchManifest,
  type TrainingAdmissionBundle } from "../src/index.js";
import { id, makeCasual, makeManifest, makeOutcome } from "../scripts/fixture-data.js";
import { makeTrainingFixture } from "../scripts/training-fixture-data.js";

const fixture = JSON.parse(await readFile(new URL("../fixtures/training.json", import.meta.url), "utf8")) as Awaited<ReturnType<typeof makeTrainingFixture>>;
const clone = <T>(v: T): T => structuredClone(v);
const progress = () => clone(fixture.bundle.entries[0].progress);
function evaluate(p: unknown | null, at = fixture.checkpoint.timestamp, gameId = fixture.manifest.identity.gameId) {
  return evaluateTrainingEligibility({ policy: fixture.policy, championId: fixture.manifest.roster[0].championId, gameId, at, progress: p });
}
function bind(m: MatchManifest = clone(fixture.ordinaryManifest)) {
  return bindTrainingAdmissions({ manifest: m, registry: fixture.registry, policy: fixture.policy, checkpoint: fixture.checkpoint,
    entries: m.roster.map((e, i) => ({ championId: e.championId, ordinaryAdmissionEvidenceHash: e.admissionEvidenceHash,
      revalidationEvidenceHash: e.admissionEvidenceHash, progress: fixture.bundle.entries[i].progress })) });
}
function verify(bundle: unknown = fixture.bundle, manifest: unknown = fixture.manifest, overrides = {}) {
  return validateTrainingAdmissionBundle({ manifest, registry: fixture.registry, bundle, expectedPolicyHash: fixture.policyHash,
    checkpoint: fixture.checkpoint, ...overrides });
}
// Rehashing attacker-controlled outer documents must not turn invalid eligibility into acceptance.
function rebind(m: MatchManifest, b: TrainingAdmissionBundle) {
  b.entries.forEach((e, i) => {
    e.admission.progressHash = hashDocument(e.progress);
    m.roster[i].admissionEvidenceHash = hashDocument(e.admission);
  });
  b.manifestHash = hashDocument(m);
}

test("training extension fixtures regenerate without replacing existing wire revisions", async () => {
  assert.deepEqual(await makeTrainingFixture(), fixture);
  assert.equal(fixture.manifest.revision, "2.0.0-alpha.1");
  assert.equal(fixture.bundle.revision, "a0.training.1");
  assert.equal(hashDocument(fixture.bundle), fixture.hashes.bundle);
  assert.equal(hashDocument(fixture.manifest), fixture.hashes.manifest);
  verify();
});

test("training policy cannot silently shorten time, accept match counts or sell early access", () => {
  for (const change of [{ durationSeconds: "604799" }, { matchCountAlternative: 100 }, { paidEarlyAccess: true },
    { startsAt: "champion_creation" }, { scope: "handler_game" }, { revision: "a0.training.2" }, { bypass: true }]) {
    assert.throws(() => trainingPolicySchema.parse({ ...INITIAL_TRAINING_POLICY, ...change }));
  }
});

test("eligibility begins at the exact seventh day with an integer UTC countdown", () => {
  for (const [i, status, remaining] of [[0, "training", "1"], [1, "eligible", "0"], [2, "eligible", "0"]] as const) {
    const row = fixture.snapshots[i];
    assert.deepEqual(evaluate(row.progress, row.decision.evaluatedAt), row.decision);
    assert.equal(row.decision.status, status); assert.equal(row.decision.remainingSeconds, remaining);
    assert.equal(row.decision.trainingStartedAt, "1400"); assert.equal(row.decision.purseEligibleAt, "606200");
  }
});

test("unknown history and confirmed empty history have distinct non-eligible states", () => {
  assert.equal(evaluate(null).status, "unavailable");
  const p = progress(); p.firstCompletion = null; p.validatedMatchCount = "0";
  const d = evaluate(p); assert.equal(d.status, "not_started");
  assert.equal(d.purseEligibleAt, null); assert.equal(d.remainingSeconds, null);
});

test("large validated counts do not bypass time; another game or champion cannot reuse progress", () => {
  const p = clone(fixture.snapshots[0].progress); p.validatedMatchCount = "1000000000000000000";
  assert.equal(evaluate(p, "606199").status, "training");
  assert.throws(() => evaluate(p, "606199", id(8000)), /scope/);
  p.championId = id(8001); assert.throws(() => evaluate(p, "606199"), /scope/);
});

test("history reduction deduplicates retries, ignores arrival order and deterministically selects the first result", () => {
  const first = fixture.completions[0], later = { ...first, matchId: id(8002), completedAt: "1500" };
  const input = { championId: first.championId, gameId: first.gameId, checkpoint: fixture.checkpoint, historyEvidenceHash: id(8003) };
  const a = summarizeTrainingHistory({ ...input, completions: [later, first, later, first] });
  const b = summarizeTrainingHistory({ ...input, completions: [first, later] });
  assert.deepEqual(a, b); assert.equal(a.validatedMatchCount, "2"); assert.deepEqual(a.firstCompletion, first);
  const tied = { ...first, matchId: id(1) };
  assert.equal(summarizeTrainingHistory({ ...input, completions: [first, tied] }).firstCompletion!.matchId, id(1));
});

test("conflicting, future or cross-game completion records fail rather than changing the clock", () => {
  const first = fixture.completions[0];
  const input = { championId: first.championId, gameId: first.gameId, checkpoint: fixture.checkpoint, historyEvidenceHash: id(8004) };
  assert.throws(() => summarizeTrainingHistory({ ...input, completions: [first, { ...first, completedAt: "1401" }] }), /conflicting/);
  assert.throws(() => summarizeTrainingHistory({ ...input, completions: [{ ...first, completedAt: "606201" }] }), /future/);
  assert.throws(() => summarizeTrainingHistory({ ...input, completions: [{ ...first, gameId: id(8005) }] }), /scope/);
  assert.throws(() => summarizeTrainingHistory({ ...input, completions: Array(1025).fill(first) }));
});

test("summary consistency, future snapshots and uint64 eligibility overflow fail closed", () => {
  const p = progress(); p.validatedMatchCount = "0"; assert.throws(() => validateTrainingProgress(p), /count/);
  p.validatedMatchCount = "1"; p.firstCompletion!.gameId = id(8006); assert.throws(() => validateTrainingProgress(p), /scope/);
  const q = progress(); assert.throws(() => evaluate(q, "606199"), /snapshot/);
  q.checkpoint.timestamp = "18446744073709551615"; q.firstCompletion!.completedAt = q.checkpoint.timestamp;
  assert.throws(() => validateTrainingProgress(q), /uint64/);
  assert.throws(() => evaluate(progress(), "606200.5"));
});

test("only a participant's played free result can produce a completion record", async () => {
  const c = await makeCasual();
  const input = { manifest: c.manifest, registry: c.registry, qualification: c.qualification, result: c.result,
    championId: c.manifest.roster[0].championId, completedAt: "1400", verificationEvidenceHash: id(8007) };
  assert.equal(trainingCompletionFromResult(input).completedAt, "1400");
  assert.throws(() => trainingCompletionFromResult({ ...input, championId: id(8008) }), /qualified play/);
  assert.throws(() => trainingCompletionFromResult({ ...input, completedAt: "999" }), /completion order/);
  assert.throws(() => trainingCompletionFromResult({ ...input, verificationEvidenceHash: ZERO_HASH }));
  assert.throws(() => trainingCompletionFromResult({ ...input, result: { ...c.result, kind: "cancelled" } }));
  const paid = await makeOutcome("played");
  assert.throws(() => trainingCompletionFromResult({ ...input, ...paid }), /free unfunded/);
});

test("a no-show or walkover cannot be relabeled as qualifying training", async () => {
  const c = await makeCasual(), q = clone(c.qualification), result = clone(c.result);
  q.entrants[0] = { ...q.entrants[0], status: "no_show", reason: "explicit_abandonment" };
  result.qualificationHash = hashDocument(q);
  assert.throws(() => trainingCompletionFromResult({ manifest: c.manifest, registry: c.registry, qualification: q, result,
    championId: q.entrants[0].championId, completedAt: "1400", verificationEvidenceHash: id(8009) }));
  result.kind = "walkover";
  assert.throws(() => trainingCompletionFromResult({ manifest: c.manifest, registry: c.registry, qualification: c.qualification, result,
    championId: q.entrants[1].championId, completedAt: "1400", verificationEvidenceHash: id(8009) }));
});

test("binding is immutable and preserves each ordinary admission reference inside the committed hash", () => {
  const original = clone(fixture.ordinaryManifest), before = clone(original), b = bind(original);
  assert.deepEqual(original, before); assert.deepEqual(b, { manifest: fixture.manifest, bundle: fixture.bundle });
  b.bundle.entries.forEach((e, i) => {
    assert.equal(e.admission.ordinaryAdmissionEvidenceHash, original.roster[i].admissionEvidenceHash);
    assert.equal(b.manifest.roster[i].admissionEvidenceHash, hashDocument(e.admission));
  });
  assert.equal(trainingManifestContextHash(original), trainingManifestContextHash(b.manifest));
});

test("a rehashed bundle with one untrained entrant still rejects the whole funded roster", () => {
  const b = clone(fixture.bundle), m = clone(fixture.manifest);
  b.entries[1].progress.firstCompletion!.completedAt = "1401"; rebind(m, b);
  assert.throws(() => verify(b, m), /incomplete/);
  b.entries[1].progress.firstCompletion = null; b.entries[1].progress.validatedMatchCount = "0"; rebind(m, b);
  assert.throws(() => verify(b, m), /incomplete/);
});

test("missing, reordered or duplicate admission entries cannot establish roster eligibility", () => {
  const b = clone(fixture.bundle); b.entries.pop(); assert.throws(() => verify(b), /coverage/);
  const c = clone(fixture.bundle); c.entries.reverse(); assert.throws(() => verify(c), /scope\/order/);
  c.entries = Array(4).fill(fixture.bundle.entries[0]); assert.throws(() => verify(c), /scope\/order/);
});

test("an outer rehash cannot detach evidence from source amounts, payout or schedule", () => {
  for (const mutate of [(m: MatchManifest) => { m.roster[0].payout = `0x${"f".repeat(40)}`; },
    (m: MatchManifest) => { m.schedule.startAt = "606601"; },
    (m: MatchManifest) => { m.eventId = id(8010); },
    (m: MatchManifest) => { m.sources = m.sources.filter(s => s.kind !== "sponsor"); }]) {
    const m = clone(fixture.manifest), b = clone(fixture.bundle); mutate(m); b.manifestHash = hashDocument(m);
    assert.throws(() => verify(b, m), /binding/);
  }
});

test("policy and checkpoint expectations are external to the supplied bundle", () => {
  assert.throws(() => verify(fixture.bundle, fixture.manifest, { expectedPolicyHash: id(8011) }), /approved policy/);
  assert.throws(() => verify(fixture.bundle, fixture.manifest, { checkpoint: { ...fixture.checkpoint, hash: id(8012) } }), /common checkpoint/);
  assert.throws(() => verify(fixture.bundle, fixture.manifest, { checkpoint: { ...fixture.checkpoint, hash: ZERO_HASH } }), /checkpoint domain/);
  assert.throws(() => verify(fixture.bundle, fixture.manifest, { checkpoint: { ...fixture.checkpoint, timestamp: fixture.manifest.schedule.enrollmentClosesAt } }), /after enrollment/);
  const b = clone(fixture.bundle), m = clone(fixture.manifest);
  b.entries[0].progress.checkpoint.number = "999"; rebind(m, b); assert.throws(() => verify(b, m), /common checkpoint/);
});

test("entry-only and sponsor-only prize matches require training even with no champion-purse source", () => {
  for (const kind of ["entry_pot", "sponsor"] as const) {
    const m = clone(fixture.ordinaryManifest); m.sources = m.sources.filter(s => s.kind === kind);
    m.format = { kind: "none" }; m.tierId = null; if (kind === "sponsor") m.doorFeeWei = "0";
    const b = bind(m); verify(b.bundle, b.manifest);
    const unready = clone(b.bundle); unready.entries[0].progress.firstCompletion!.completedAt = "1401";
    rebind(b.manifest, unready); assert.throws(() => verify(unready, b.manifest), /incomplete/);
  }
});

test("free matches remain outside funded admission, and old manifests do not acquire implicit training approval", () => {
  const m = clone(fixture.ordinaryManifest); m.sources = []; m.format = { kind: "none" }; m.doorFeeWei = "0"; m.tierId = null;
  assert.throws(() => bind(m), /requires funded/);
  assert.throws(() => verify(fixture.bundle, fixture.ordinaryManifest), /manifest binding/);
  assert.throws(() => verify(null));
  assert.equal(makeManifest().manifest.revision, "2.0.0-alpha.1");
});

test("game progress survives handler, season, league and version changes when rebound to a new valid match", () => {
  const m = clone(fixture.ordinaryManifest), registry = clone(fixture.registry);
  m.roster[0].handlerId = id(8013); m.roster[0].ownershipSnapshotHash = id(8014);
  registry.version.rulesArtifactHash = id(8015); registry.season.gameVersionHash = hashDocument(registry.version);
  registry.season.seasonId = id(8016); registry.league.leagueId = id(8017);
  registry.season.leagueId = id(8017); registry.tiers.leagueId = id(8017);
  m.identity = { ...m.identity, gameVersionHash: hashDocument(registry.version), seasonId: id(8016), leagueId: id(8017), tierConfigHash: hashDocument(registry.tiers) };
  const bound = bindTrainingAdmissions({ manifest: m, registry, policy: fixture.policy, checkpoint: fixture.checkpoint,
    entries: m.roster.map((e, i) => ({ championId: e.championId, ordinaryAdmissionEvidenceHash: e.admissionEvidenceHash,
      revalidationEvidenceHash: e.admissionEvidenceHash, progress: fixture.bundle.entries[i].progress })) });
  validateTrainingAdmissionBundle({ ...bound, registry, checkpoint: fixture.checkpoint, expectedPolicyHash: fixture.policyHash });
  assert.equal(bound.bundle.entries[0].progress.firstCompletion!.completedAt, "1400");
});

test("archived early-reservation evidence stays distinct from common-checkpoint revalidation", () => {
  const m = clone(fixture.ordinaryManifest);
  const bound = bindTrainingAdmissions({ manifest: m, registry: fixture.registry, policy: fixture.policy, checkpoint: fixture.checkpoint,
    entries: m.roster.map((e, i) => ({ championId: e.championId, ordinaryAdmissionEvidenceHash: e.admissionEvidenceHash,
      revalidationEvidenceHash: id(9000 + i), progress: fixture.bundle.entries[i].progress })) });
  verify(bound.bundle, bound.manifest);
  bound.bundle.entries.forEach((e, i) => {
    assert.equal(e.admission.ordinaryAdmissionEvidenceHash, m.roster[i].admissionEvidenceHash);
    assert.equal(e.admission.revalidationEvidenceHash, id(9000 + i));
  });
  bound.bundle.entries[0].admission.revalidationEvidenceHash = id(9010);
  assert.throws(() => verify(bound.bundle, bound.manifest), /binding/);
});
