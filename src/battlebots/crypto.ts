import {
  createHash,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
  timingSafeEqual,
} from "node:crypto";
export const hash = (raw: string) =>
  createHash("sha256").update(raw).digest("hex");
export function outbound(privateKey: string, raw: string) {
  const timestamp = String(Date.now()),
    nonce = randomBytes(16).toString("hex");
  return {
    "content-type": "application/json",
    "x-champions-timestamp": timestamp,
    "x-champions-nonce": nonce,
    "x-champions-signature": sign(
      null,
      Buffer.from(timestamp + "." + nonce + "." + hash(raw)),
      createPrivateKey({
        key: Buffer.from(privateKey, "base64"),
        format: "der",
        type: "pkcs8",
      }),
    ).toString("base64"),
  };
}
export function validateHmac(
  key: string,
  raw: string,
  headers: Record<string, string | undefined>,
  now = Date.now(),
) {
  const ts = headers["x-champions-timestamp"] || "",
    nonce = headers["x-champions-nonce"] || "",
    signature = headers["x-champions-hmac"] || "";
  if (
    !key ||
    !/^\d{13}$/.test(ts) ||
    Math.abs(now - Number(ts)) > 300000 ||
    !/^[a-zA-Z0-9_-]{8,64}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    throw Object.assign(new Error("Invalid adapter envelope"), { status: 401 });
  const expected = createHmac("sha256", key)
    .update(ts + "." + nonce + "." + hash(raw))
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    throw Object.assign(new Error("Invalid adapter signature"), {
      status: 401,
    });
  return nonce;
}
