import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, verify } from "node:crypto";
import { hash, outbound, validateHmac } from "./crypto.ts";
test("adapter signs exact raw bytes with Ed25519", () => {
  const key = generateKeyPairSync("ed25519");
  const raw = JSON.stringify({ external_match_id: "example" });
  const h = outbound(
    key.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    raw,
  );
  const message =
    h["x-champions-timestamp"] + "." + h["x-champions-nonce"] + "." + hash(raw);
  assert.ok(
    verify(
      null,
      Buffer.from(message),
      key.publicKey,
      Buffer.from(h["x-champions-signature"], "base64"),
    ),
  );
  assert.ok(
    !verify(
      null,
      Buffer.from(message + " "),
      key.publicKey,
      Buffer.from(h["x-champions-signature"], "base64"),
    ),
  );
});
test("HMAC rejects modified body, wrong key, expired and malformed envelope", () => {
  const raw = '{"champion_id":"c1"}',
    now = Date.now(),
    ts = String(now),
    nonce = "1234567890abcdef";
  const h = {
    "x-champions-timestamp": ts,
    "x-champions-nonce": nonce,
    "x-champions-hmac": createHmac("sha256", "secret")
      .update(ts + "." + nonce + "." + hash(raw))
      .digest("hex"),
  };
  assert.equal(validateHmac("secret", raw, h, now), nonce);
  assert.throws(() => validateHmac("wrong", raw, h, now));
  assert.throws(() => validateHmac("secret", raw + " ", h, now));
  assert.throws(() => validateHmac("secret", raw, h, now + 300001));
  assert.throws(() =>
    validateHmac("secret", raw, { ...h, "x-champions-hmac": "00" }, now),
  );
});
