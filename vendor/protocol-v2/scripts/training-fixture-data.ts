import { INITIAL_TRAINING_POLICY, bindTrainingAdmissions, evaluateTrainingEligibility,
  summarizeTrainingHistory, trainingCompletionFromResult } from "../src/training.js";
import { hashDocument } from "../src/canonical.js";
import { validatePermissions } from "../src/validation.js";
import { id, makeCasual, makeManifest } from "./fixture-data.js";

export async function makeTrainingFixture() {
  const casual = await makeCasual(), { manifest, registry, permissions } = makeManifest();
  // Separate future event; never regenerate or mutate the old signed vectors.
  registry.season.endsAt = "900000";
  manifest.eventId = id(3000); manifest.matchId = id(3001);
  manifest.schedule = { ...manifest.schedule, enrollmentClosesAt: "606500", startAt: "606600",
    resultCommitDeadline: "606700", revealAt: "607000", settlementNotBefore: "607010" };
  permissions.forEach(p => { p.validUntil = "900000"; });
  manifest.roster.forEach((e, i) => { e.dayBucket = "1970-01-08"; e.permissionsHash = hashDocument(permissions[i]); });
  const checkpoint = { chainId: manifest.chainId, number: "1000", hash: id(3002), timestamp: "606200",
    finalityPolicyHash: manifest.schedule.finalityPolicyHash };
  validatePermissions(manifest, permissions, checkpoint.timestamp);
  const completions = manifest.roster.map(e => trainingCompletionFromResult({ manifest: casual.manifest, registry: casual.registry,
    qualification: casual.qualification, result: casual.result, championId: e.championId,
    completedAt: "1400", verificationEvidenceHash: id(3003) }));
  const progresses = completions.map(c => summarizeTrainingHistory({ championId: c.championId, gameId: c.gameId,
    checkpoint, completions: [c], historyEvidenceHash: id(3004) }));
  const bound = bindTrainingAdmissions({ manifest, registry, policy: INITIAL_TRAINING_POLICY, checkpoint,
    entries: manifest.roster.map((e, i) => ({ championId: e.championId, ordinaryAdmissionEvidenceHash: e.admissionEvidenceHash,
      revalidationEvidenceHash: e.admissionEvidenceHash, progress: progresses[i] })) });
  const snapshots = ["606199", "606200", "606201"].map(at => {
    const progress = { ...progresses[0], checkpoint: { ...checkpoint, timestamp: at } };
    return { progress, decision: evaluateTrainingEligibility({ policy: INITIAL_TRAINING_POLICY,
      championId: progress.championId, gameId: progress.gameId, at, progress }) };
  });
  return { fixtureOnly: true, assurance: "synthetic_unverified_history", policy: INITIAL_TRAINING_POLICY,
    policyHash: hashDocument(INITIAL_TRAINING_POLICY), ordinaryManifest: manifest, registry, permissions, checkpoint,
    completions, ...bound, snapshots, hashes: { manifest: hashDocument(bound.manifest), bundle: hashDocument(bound.bundle),
      admissions: bound.bundle.entries.map(e => hashDocument(e.admission)) } };
}
