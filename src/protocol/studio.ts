import { createPrivateKey, randomBytes, sign } from "node:crypto";
import * as P from "@agentborn/protocol-v2";
export function studioCredentials(
  input: { keyId: string; gameId: string; privateKeyPem: string },
  clock = () => Date.now(),
) {
  const keyId = P.idSchema.parse(input.keyId),
    gameId = P.idSchema.parse(input.gameId),
    key = createPrivateKey(input.privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519")
    throw new Error("Studio replay key must be Ed25519");
  return async (method: "GET", path: string) => {
    if (
      method !== "GET" ||
      !/^\/api\/v2\/matches\/0x[0-9a-f]{64}\/studio-package$/.test(path)
    )
      throw new Error("Studio credential scope");
    const message = P.studioRequestSchema.parse({
      protocol: P.PROTOCOL,
      revision: P.REVISION,
      kind: "studio_request",
      keyId,
      gameId,
      method,
      path,
      bodySha256: await P.sha256Bytes(new Uint8Array()),
      issuedAt: String(Math.floor(clock() / 1000)),
      nonce: `0x${randomBytes(32).toString("hex")}`,
    });
    const bytes = P.studioSigningBytes(message);
    return {
      "x-agentborn-request": Buffer.from(bytes).toString("base64url"),
      "x-agentborn-signature": `0x${sign(null, bytes, key).toString("hex")}`,
    };
  };
}
