import { z } from "zod";
import { bytesToHex, hexToBytes, keccak256, stringToBytes, type Hex } from "viem";
import { canonicalJson, hashDocument, parseCanonical, parseDocument } from "./canonical.js";
import { sealingContext } from "./commitments.js";
import { hashSchema, idSchema, resultSchema, replaySchema, sealedEnvelopeSchema,
  PROTOCOL, REVISION, LIMITS, type MatchManifest } from "./schemas.js";

export const SEALED_BYTES = LIMITS.replayBytes + LIMITS.documentBytes;
export const ENVELOPE_BYTES = SEALED_BYTES * 2 + 4096;
export const sealedPayloadSchema = z.strictObject({ result: resultSchema, replay: replaySchema,
  seed: hashSchema.nullable(), seedCommitment: hashSchema, nonce: idSchema });
export type SealedPayload = z.infer<typeof sealedPayloadSchema>;
function buffer(bytes: Uint8Array): ArrayBuffer { return new Uint8Array(bytes).buffer; }

/** Persist this material before use. Never regenerate it on a retry. */
export function createSealingMaterial() {
  return { key: bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32))),
    iv: bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(12))),
    nonce: bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32))) };
}

/** One fresh key/IV per package. Explicit material permits deterministic published test vectors. */
export async function encryptPayload(manifest: MatchManifest, raw: unknown, keyHex: string, ivHex: string) {
  const payload = parseDocument(sealedPayloadSchema, raw, SEALED_BYTES);
  const keyBytes = hexToBytes(idSchema.parse(keyHex) as Hex);
  if (!/^0x[0-9a-f]{24}$/.test(ivHex)) throw new Error("INVALID_DOCUMENT: AES-GCM IV");
  const key = await globalThis.crypto.subtle.importKey("raw", buffer(keyBytes), "AES-GCM", false, ["encrypt"]);
  const aad = stringToBytes(sealingContext(manifest));
  const ciphertext = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: buffer(hexToBytes(ivHex as Hex)),
    additionalData: buffer(aad), tagLength: 128 }, key, buffer(stringToBytes(canonicalJson(payload, SEALED_BYTES))));
  return parseDocument(sealedEnvelopeSchema, { protocol: PROTOCOL, revision: REVISION,
    matchId: manifest.matchId, manifestHash: hashDocument(manifest), algorithm: "AES-256-GCM",
    iv: ivHex, aadHash: keccak256(aad), ciphertext: bytesToHex(new Uint8Array(ciphertext)) }, ENVELOPE_BYTES);
}

export async function decryptPayload(manifest: MatchManifest, raw: unknown, keyHex: string): Promise<SealedPayload> {
  const envelope = parseDocument(sealedEnvelopeSchema, raw, ENVELOPE_BYTES);
  if (envelope.matchId !== manifest.matchId || envelope.manifestHash !== hashDocument(manifest)) {
    throw new Error("INVALID_DOCUMENT: sealed envelope identity");
  }
  const aad = stringToBytes(sealingContext(manifest));
  if (envelope.aadHash !== keccak256(aad)) throw new Error("INVALID_DOCUMENT: sealed context");
  const key = await globalThis.crypto.subtle.importKey("raw", buffer(hexToBytes(idSchema.parse(keyHex) as Hex)), "AES-GCM", false, ["decrypt"]);
  const plaintext = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: buffer(hexToBytes(envelope.iv as Hex)),
    additionalData: buffer(aad), tagLength: 128 }, key, buffer(hexToBytes(envelope.ciphertext as Hex)));
  return parseCanonical(sealedPayloadSchema, new Uint8Array(plaintext), SEALED_BYTES);
}
