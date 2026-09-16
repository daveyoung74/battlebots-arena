import { encodeAbiParameters, hashTypedData, keccak256, parseAbiParameters, stringToBytes, type Hex } from "viem";
import { canonicalJson, hashDocument, parseDocument } from "./canonical.js";
import { hashSchema, idSchema, matchManifestSchema, entryAuthorizationSchema, resultSchema, ZERO_HASH, type MatchManifest } from "./schemas.js";

export const COMMITMENT_TAGS = Object.freeze({
  seed: keccak256(stringToBytes("AgentBorn.v2.seed.2.0.0-alpha.1")),
  result: keccak256(stringToBytes("AgentBorn.v2.result.2.0.0-alpha.1")),
});
export const SEED_ABI = parseAbiParameters("bytes32 tag,uint256 chainId,address board,bytes32 eventId,bytes32 matchId,bytes32 manifestHash,bytes32 seed");
export const RESULT_ABI = parseAbiParameters("bytes32 tag,uint256 chainId,address board,bytes32 eventId,bytes32 matchId,bytes32 manifestHash,bytes32 resultHash,bytes32 replayHash,bytes32 seedCommitment,bytes32 sealedEnvelopeHash,uint64 revealAt,uint64 settlementNotBefore,bytes32 nonce");
export const OUTCOME_TAG = keccak256(stringToBytes("AgentBorn.v2.outcome.2.0.0-alpha.1"));
export const OUTCOME_ABI = parseAbiParameters("bytes32 tag,bytes32 matchId,bytes32 manifestHash,bytes32 qualificationHash,uint8 kind,bytes32[] placements,uint16[] sharesBps,(bytes32 sourceId,uint256 chainId,address token,uint8 kind,address beneficiary,bytes32 championId,uint256 amount)[] payments");
/** Financial result bytes use Solidity ABI so A1 can bind actual winners/payments, not an opaque JSON hash. */
export function encodeOutcome(raw: unknown): Hex {
  const result = parseDocument(resultSchema, raw);
  const kinds = { treasury: 0, prize: 1, return: 2, reservation_release: 3 } as const;
  return encodeAbiParameters(OUTCOME_ABI, [OUTCOME_TAG, result.matchId as Hex, result.manifestHash as Hex,
    result.qualificationHash as Hex, result.kind === "played" ? 0 : 1, result.placements as Hex[], result.sharesBps,
    result.payments.map(payment => ({ sourceId: payment.sourceId as Hex, chainId: BigInt(payment.asset.chainId),
      token: payment.asset.token as Hex, kind: kinds[payment.kind], beneficiary: payment.beneficiary as Hex,
      championId: (payment.championId ?? ZERO_HASH) as Hex, amount: BigInt(payment.amount) }))]);
}
export function hashResult(raw: unknown): Hex { return keccak256(encodeOutcome(raw)); }
function identity(manifest: MatchManifest) {
  parseDocument(matchManifestSchema, manifest);
  return [BigInt(manifest.chainId), manifest.board as Hex, manifest.eventId as Hex,
    manifest.matchId as Hex, hashDocument(manifest)] as const;
}
export function encodeSeed(manifest: MatchManifest, seed: string): Hex {
  return encodeAbiParameters(SEED_ABI, [COMMITMENT_TAGS.seed, ...identity(manifest), idSchema.parse(seed) as Hex]);
}
export function commitSeed(manifest: MatchManifest, seed: string): Hex { return keccak256(encodeSeed(manifest, seed)); }
export type ResultCommitmentInput = { resultHash: string; replayHash: string; seedCommitment: string;
  sealedEnvelopeHash: string; nonce: string };
export function encodeResult(manifest: MatchManifest, input: ResultCommitmentInput): Hex {
  const hashes = [input.resultHash, input.replayHash, input.seedCommitment, input.sealedEnvelopeHash]
    .map(value => hashSchema.parse(value) as Hex);
  return encodeAbiParameters(RESULT_ABI, [COMMITMENT_TAGS.result, ...identity(manifest),
    hashes[0], hashes[1], hashes[2], hashes[3], BigInt(manifest.schedule.revealAt),
    BigInt(manifest.schedule.settlementNotBefore), idSchema.parse(input.nonce) as Hex]);
}
export function commitResult(manifest: MatchManifest, input: ResultCommitmentInput): Hex {
  return keccak256(encodeResult(manifest, input));
}
export function sealingContext(manifest: MatchManifest): string {
  return canonicalJson({ protocol: manifest.protocol, revision: manifest.revision, chainId: manifest.chainId,
    board: manifest.board, eventId: manifest.eventId, matchId: manifest.matchId,
    manifestHash: hashDocument(manifest), revealAt: manifest.schedule.revealAt,
    settlementNotBefore: manifest.schedule.settlementNotBefore });
}
export const HANDLER_TYPES = { HandlerPermissions: [
  { name: "handlerId", type: "bytes32" }, { name: "championId", type: "bytes32" },
  { name: "permissionsHash", type: "bytes32" }, { name: "version", type: "uint256" },
  { name: "nonce", type: "uint256" }, { name: "validAfter", type: "uint64" },
  { name: "validUntil", type: "uint64" },
] } as const;
export function handlerTypedData(raw: unknown) {
  const value = parseDocument(entryAuthorizationSchema, raw);
  if (BigInt(value.validUntil) <= BigInt(value.validAfter)) throw new Error("INVALID_DOCUMENT: authorization interval");
  return { domain: { name: "AgentBornHandlerV2", version: "2.0.0-alpha.1", chainId: BigInt(value.chainId),
    verifyingContract: value.board as Hex }, primaryType: "HandlerPermissions" as const, types: HANDLER_TYPES,
  message: { handlerId: value.handlerId as Hex, championId: value.championId as Hex,
    permissionsHash: value.permissionsHash as Hex, version: BigInt(value.version), nonce: BigInt(value.nonce),
    validAfter: BigInt(value.validAfter), validUntil: BigInt(value.validUntil) } };
}
export function handlerAuthorizationHash(raw: unknown): Hex { return hashTypedData(handlerTypedData(raw)); }
export { ZERO_HASH };
