import { hashDocument, parseDocument } from "./canonical.js";
import { commitResult, commitSeed, hashResult } from "./commitments.js";
import { commitmentReceiptSchema, openingSchema, timeSchema, ZERO_HASH, LIMITS } from "./schemas.js";
import { decryptPayload, ENVELOPE_BYTES } from "./sealing.js";
import { invariant, registrySchema, validateManifest, validateQualification, validateReplay, validateResult } from "./validation.js";

/** Verifies content against a supplied receipt. A4 must independently authenticate chain inclusion/finality. */
export async function verifyPublishedPackage(input: { manifest: unknown; registry: unknown; qualification: unknown;
  opening: unknown; envelope: unknown; receipt: unknown; now: string }) {
  const registry = parseDocument(registrySchema, input.registry);
  const manifest = validateManifest(input.manifest, registry);
  const opening = parseDocument(openingSchema, input.opening);
  const receipt = parseDocument(commitmentReceiptSchema, input.receipt);
  const now = BigInt(timeSchema.parse(input.now));
  invariant(now >= BigInt(manifest.schedule.revealAt), "NOT_RELEASED: public opening time");
  invariant(receipt.chainId === manifest.chainId && receipt.board === manifest.board &&
    receipt.matchId === manifest.matchId && receipt.manifestHash === hashDocument(manifest), "receipt domain");
  invariant(receipt.block.chainId === manifest.chainId &&
    receipt.block.finalityPolicyHash === manifest.schedule.finalityPolicyHash &&
    BigInt(receipt.block.timestamp) <= BigInt(manifest.schedule.resultCommitDeadline), "commitment block/deadline");
  invariant(opening.matchId === manifest.matchId && opening.manifestHash === hashDocument(manifest), "opening identity");
  invariant(hashDocument(input.envelope, ENVELOPE_BYTES) === receipt.sealedEnvelopeHash &&
    opening.sealedEnvelopeHash === receipt.sealedEnvelopeHash, "sealed envelope hash");
  const qualification = validateQualification(manifest, input.qualification);
  invariant(qualification.checkpoint, "chain receipt verification needs a checkpoint; use signed-casual verification otherwise");
  invariant(BigInt(receipt.block.timestamp) >= BigInt(qualification.checkpoint.timestamp), "result commitment precedes qualification");
  const result = validateResult(manifest, registry.version, qualification, opening.result);
  const seedCommitment = result.kind === "walkover" ? ZERO_HASH :
    commitSeed(manifest, opening.seed ?? ZERO_HASH);
  invariant(result.kind !== "walkover" || opening.seed === null, "walkover has no seed");
  invariant(opening.seedCommitment === seedCommitment && receipt.seedCommitment === seedCommitment, "seed commitment");
  const payload = await decryptPayload(manifest, input.envelope, opening.encryptionKey);
  invariant(payload.seed === opening.seed && payload.seedCommitment === opening.seedCommitment &&
    payload.nonce === opening.nonce && hashResult(payload.result) === hashResult(result), "opening differs from sealed payload");
  const replay = validateReplay(manifest, registry.version, result, payload.replay);
  invariant(hashDocument(replay, LIMITS.replayBytes) === opening.replayHash, "replay hash");
  const commitment = commitResult(manifest, { resultHash: hashResult(result), replayHash: opening.replayHash,
    seedCommitment, sealedEnvelopeHash: opening.sealedEnvelopeHash, nonce: opening.nonce });
  invariant(commitment === receipt.resultCommitment, "result commitment");
  return { result, replay, commitment, assurance: "matches_supplied_receipt" as const,
    requiresIndependentVerification: ["chain_inclusion_and_finality", "registry_approval", "seed_commitment_precedes_simulation"] as const };
}
