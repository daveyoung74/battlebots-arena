import { bytesToHex, hexToBytes, stringToBytes, type Hex } from "viem";
import { canonicalJson, hashDocument, parseDocument } from "./canonical.js";
import { commitSeed, hashResult } from "./commitments.js";
import { casualSignalSchema, studioRequestSchema, timeSchema, ZERO_HASH, LIMITS } from "./schemas.js";
import { invariant, registrySchema, validateManifest, validateQualification, validateReplay, validateResult } from "./validation.js";

function buffer(value: Uint8Array): ArrayBuffer { return new Uint8Array(value).buffer; }
export async function sha256Bytes(bytes: Uint8Array) {
  return bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", buffer(bytes))));
}
export function studioSigningBytes(raw: unknown): Uint8Array {
  return stringToBytes(canonicalJson(parseDocument(studioRequestSchema, raw)));
}
export function casualSigningBytes(raw: unknown): Uint8Array {
  const { signature: _signature, ...message } = parseDocument(casualSignalSchema, raw);
  void _signature;
  return stringToBytes(canonicalJson(message));
}
export async function verifyEd25519(bytes: Uint8Array, signature: string, publicKey: string) {
  invariant(/^0x[0-9a-f]{64}$/.test(publicKey) && /^0x[0-9a-f]{128}$/.test(signature), "Ed25519 key/signature encoding");
  const key = await globalThis.crypto.subtle.importKey("raw", buffer(hexToBytes(publicKey as Hex)), "Ed25519", false, ["verify"]);
  return globalThis.crypto.subtle.verify("Ed25519", key, buffer(hexToBytes(signature as Hex)), buffer(bytes));
}

/** No chain dependency for genuinely free play. The caller supplies the trusted AgentBorn key for keyId. */
export async function verifyCasualPackage(input: { manifest: unknown; registry: unknown; qualification: unknown;
  result: unknown; replay: unknown; signal: unknown; seed: string | null; publicKey: string; trustedKeyId: string; now: string }) {
  const registry = parseDocument(registrySchema, input.registry), manifest = validateManifest(input.manifest, registry);
  invariant(manifest.sources.length === 0 && manifest.doorFeeWei === "0" && manifest.tierId === null, "casual signature cannot authorize funded results");
  const signal = parseDocument(casualSignalSchema, input.signal), now = BigInt(timeSchema.parse(input.now));
  invariant(signal.keyId === input.trustedKeyId, "signal key identity");
  invariant(signal.matchId === manifest.matchId && signal.manifestHash === hashDocument(manifest), "casual signal identity");
  invariant(BigInt(signal.publishedAt) >= BigInt(manifest.schedule.revealAt) && BigInt(signal.publishedAt) <= now, "casual release time");
  invariant(await verifyEd25519(casualSigningBytes(signal), signal.signature, input.publicKey), "invalid AgentBorn signature");
  const qualification = validateQualification(manifest, input.qualification);
  const result = validateResult(manifest, registry.version, qualification, input.result);
  const replay = validateReplay(manifest, registry.version, result, input.replay);
  invariant(signal.resultHash === hashResult(result) && signal.replayHash === hashDocument(replay, LIMITS.replayBytes), "signed content hashes");
  const expectedSeed = result.kind === "played" ? commitSeed(manifest, input.seed ?? ZERO_HASH) : ZERO_HASH;
  invariant(result.kind !== "walkover" || input.seed === null, "walkover has no seed");
  invariant(signal.seedCommitment === expectedSeed, "signed seed commitment");
  return { result, replay, assurance: "signed_casual_only" as const };
}
