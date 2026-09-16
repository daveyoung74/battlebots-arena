import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { keccak256, hexToBytes, bytesToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalJson, parseCanonical, parseDocument, hashDocument, validateManifest,
  validateResult, validateReplay, validatePermissions, validateQualification, validateCancellation,
  validateGameVersion, fundingAllocation, availablePurse, assertExposure, contribution, sourceAmounts,
  cancellationReturns, allocatePrizes, commitResult, encodeResult, encodeSeed, handlerTypedData,
  hashResult, encodeOutcome,
  handlerAuthorizationHash, createProtocolClient, ProtocolResponseError, verifyPublishedPackage,
  decryptPayload, ENVELOPE_BYTES, REVISION, PROTOCOL, ZERO_HASH, ZERO_ADDRESS,
  matchManifestSchema, uintSchema, verifyCasualPackage, studioSigningBytes, verifyEd25519 } from "../src/index.js";
import { id, address, makeOutcome, makeManifest } from "../scripts/fixture-data.js";

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")) as T;
}
type Outcome = Awaited<ReturnType<typeof makeOutcome>>;
const played = await fixture<Outcome>("played"), walkover = await fixture<Outcome>("walkover");
const clone = <T>(value: T): T => structuredClone(value);

test("canonical Unicode, key ordering and integer vectors are stable", async () => {
  for (const row of await fixture<Array<{ value: unknown; canonical: string; keccak256: string }>>("canonical")) {
    assert.equal(canonicalJson(row.value), row.canonical);
    assert.equal(hashDocument(row.value), row.keccak256);
  }
  assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  assert.notEqual(hashDocument([1, 2]), hashDocument([2, 1]));
});
test("malformed canonical encodings are rejected, including duplicate keys", async () => {
  const rows = await fixture<Array<{ layer: string; json?: string }>>("invalid");
  for (const row of rows.filter(row => row.layer === "canonical")) {
    assert.throws(() => parseCanonical(z.json(), new TextEncoder().encode(row.json!)));
  }
  assert.throws(() => parseCanonical(z.json(), new Uint8Array([0xff])));
  assert.throws(() => parseCanonical(z.json(), new TextEncoder().encode(" {\"a\":1}")));
  assert.throws(() => canonicalJson({ a: undefined }));
  assert.throws(() => canonicalJson({ a: Number.POSITIVE_INFINITY }));
  assert.throws(() => canonicalJson(new Date()));
  assert.throws(() => canonicalJson(new Array(2)));
  assert.throws(() => canonicalJson(Object.defineProperty({}, "a", { get() { throw new Error("accessed"); }, enumerable: true })), /property/);
  assert.throws(() => canonicalJson(Object.defineProperty([1], "0", { get() { throw new Error("accessed"); }, enumerable: true })), /property/);
  assert.throws(() => canonicalJson(Object.defineProperty([1], "hidden", { value: true })), /decorated/);
});
test("limits and uint256 bounds fail closed", () => {
  assert.throws(() => canonicalJson({ message: "雪".repeat(40) }, 100), /LIMIT_EXCEEDED/);
  let deep: unknown = null; for (let i = 0; i < 40; i++) deep = { nested: deep };
  assert.throws(() => canonicalJson(deep), /LIMIT_EXCEEDED/);
  assert.throws(() => uintSchema.parse((BigInt(2) ** BigInt(256)).toString()));
  for (const value of ["01", "-1", "1.0", "1e3", 1]) assert.throws(() => uintSchema.parse(value));
});
test("complete domain graph and permissions validate", () => {
  assert.deepEqual(validateManifest(played.manifest, played.registry), played.manifest);
  validatePermissions(played.manifest, played.permissions, "899");
});
test("one handler and one champion per match; underfilled rosters cannot commit", () => {
  for (const field of ["championId", "handlerId"] as const) {
    const manifest = clone(played.manifest); manifest.roster[1][field] = manifest.roster[0][field];
    assert.throws(() => validateManifest(manifest, played.registry), /duplicate/);
  }
  const manifest = clone(played.manifest); manifest.roster.pop();
  assert.throws(() => validateManifest(manifest, played.registry), /ROSTER_INCOMPLETE/);
});
test("competitive version, league, season and policy mismatches are rejected", () => {
  for (const key of ["gameId", "gameVersionHash", "leagueId", "seasonId", "tierConfigHash", "matchmakingPolicyHash"] as const) {
    const manifest = clone(played.manifest); manifest.identity[key] = id(99999);
    assert.throws(() => validateManifest(manifest, played.registry));
  }
  const game = clone(played.registry.version); game.placementRules.shift();
  assert.throws(() => validateGameVersion(game), /reduced-roster/);
  const tier = clone(played);
  tier.registry.tiers.tiers.push(clone(tier.registry.tiers.tiers[0]));
  tier.manifest.identity.tierConfigHash = hashDocument(tier.registry.tiers);
  assert.throws(() => validateManifest(tier.manifest, tier.registry), /duplicate tier/);
  const interval = clone(played);
  interval.registry.tiers.tiers[0].benefits[0].minAvailablePurseWei = "2";
  interval.registry.tiers.tiers[0].benefits[0].maxAvailablePurseWei = "1";
  interval.manifest.identity.tierConfigHash = hashDocument(interval.registry.tiers);
  assert.throws(() => validateManifest(interval.manifest, interval.registry), /tier purse interval/);
});
test("late or insufficient playback schedules and early settlement are rejected", () => {
  for (const [field, value] of [["enrollmentClosesAt", "1001"], ["resultCommitDeadline", "999"], ["revealAt", "1399"], ["settlementNotBefore", "1409"]] as const) {
    const manifest = clone(played.manifest); manifest.schedule[field] = value;
    assert.throws(() => validateManifest(manifest, played.registry));
  }
});
test("unresolved policy never silently enables money admission", () => {
  const fixture = clone(played); fixture.registry.cancellation.disposition = "unresolved";
  fixture.manifest.cancellationPolicyHash = hashDocument(fixture.registry.cancellation);
  assert.throws(() => validateManifest(fixture.manifest, fixture.registry), /UNRESOLVED_POLICY/);
  assert.throws(() => cancellationReturns(played.manifest, "unresolved"), /UNRESOLVED_POLICY/);
  const usd = clone(played.manifest); usd.quoteRecordHash = id(12);
  assert.throws(() => validateManifest(usd, played.registry), /USD quote/);
});
test("fee calculation separates native sponsorship and token sponsorship", () => {
  const fees = played.manifest.sources.map(source => source.feeAmount);
  assert.deepEqual(fees, ["1", "2", "3", "4", "1", "0", "0"]);
  const native = played.result.payments.filter(payment => payment.asset.token === ZERO_ADDRESS);
  assert.equal(native.filter(payment => payment.kind === "treasury").reduce((sum, row) => sum + BigInt(row.amount), BigInt(0)), BigInt(11));
  for (const [championIndex, amount] of [[3, "5561"], [0, "3332"], [2, "2221"]] as const) {
    assert.equal(native.filter(row => row.championId === played.manifest.roster[championIndex].championId)
      .reduce((sum, row) => sum + BigInt(row.amount), BigInt(0)), BigInt(amount));
  }
  assert.deepEqual(sourceAmounts("sponsor", "100000"), { grossAmount: "100000", feeAmount: "0", netAmount: "100000" });
});
test("allocation conserves every source across tiny and large amounts; dust goes to first place", () => {
  for (const gross of ["1", "2", "99", "100", "101", "100000000000000000000000001"]) {
    const manifest = clone(played.manifest);
    manifest.sources = [{ ...manifest.sources[0], ...sourceAmounts("vault", gross) }];
    const rows = allocatePrizes(manifest, played.result.placements, [5000, 3000, 2000]);
    assert.equal(rows.reduce((sum, row) => sum + BigInt(row.amount), BigInt(0)), BigInt(gross));
    assert(rows.every(row => BigInt(row.amount) > BigInt(0)));
  }
});
test("unapproved assets, relabeled vaults, fee changes and extra sources fail", () => {
  const changedFee = clone(played.manifest); changedFee.sources[0].feeAmount = "0";
  assert.throws(() => validateManifest(changedFee, played.registry), /fee\/net/);
  const changedAsset = clone(played.manifest); changedAsset.sources[0].asset.token = address(91);
  assert.throws(() => validateManifest(changedAsset, played.registry), /must match contribution currency/);
  const unapproved = clone(played.manifest); unapproved.sources[6].asset.token = address(999);
  assert.throws(() => validateManifest(unapproved, played.registry), /unapproved asset/);
  const duplicate = clone(played.manifest); duplicate.sources.push(clone(duplicate.sources[0]));
  assert.throws(() => validateManifest(duplicate, played.registry), /duplicate/);
  const missing = clone(played.manifest); missing.sources.shift();
  assert.throws(() => validateManifest(missing, played.registry), /every roster member/);
});
test("funding allocation is separate from exposure; unavailable liabilities cannot be reused", () => {
  assert.deepEqual(fundingAllocation("101", 2000), { vault: "20", payout: "81" });
  assert.deepEqual(fundingAllocation("101", 10000), { vault: "101", payout: "0" });
  assert.throws(() => fundingAllocation("101", 1999));
  assert.throws(() => fundingAllocation("101", 10001));
  assert.equal(availablePurse("1000", "200", "150"), "650");
  assert.throws(() => availablePurse("100", "60", "60"));
  const input = { contributionWei: "20", availableWei: "100", maxSliceBps: 2000,
    maxContributionWei: "20", minimumRemainingWei: "80", grossDailyUsedWei: "30", grossDailyBudgetWei: "50" };
  assertExposure(input); // No fee-route status parameter: actual funds and limits control this calculation.
  assert.throws(() => assertExposure({ ...input, contributionWei: "21" }), /exposure/);
  assert.throws(() => assertExposure({ ...input, grossDailyUsedWei: "31" }), /daily budget/);
});
test("percentage minimum is not a top-up; bounty challengers require no purse contribution", () => {
  const format = { kind: "percentage" as const, entryBps: 1000, minimumWei: "10" };
  assert.throws(() => contribution(format, id(1), "80"), /never top up/);
  assert.equal(contribution(format, id(1), "100"), "10");
  assert.equal(contribution({ kind: "bounty", championId: id(2), contribution: { kind: "fixed", amountWei: "200" }, minimumWei: "200" }, id(1), "0"), "0");
});
test("handler pause, narrower permissions, and stricter budgets stop future admission", () => {
  const fixture = makeManifest(); fixture.permissions[0].paused = true;
  fixture.manifest.roster[0].permissionsHash = hashDocument(fixture.permissions[0]);
  assert.throws(() => validatePermissions(fixture.manifest, fixture.permissions, "899"), /inactive/);
  fixture.permissions[0].paused = false; fixture.permissions[0].allowOpen = false;
  fixture.manifest.roster[0].permissionsHash = hashDocument(fixture.permissions[0]);
  assert.throws(() => validatePermissions(fixture.manifest, fixture.permissions, "899"), /outside handler/);
});
test("played result and walkover preserve all committed sources and fixed recipients", () => {
  for (const f of [played, walkover]) {
    validateResult(f.manifest, f.registry.version, f.qualification, f.result);
    validateReplay(f.manifest, f.registry.version, f.result, f.replay);
  }
  assert.equal(walkover.result.placements.length, 1);
  assert.deepEqual(walkover.result.sharesBps, [10000]);
  assert.equal(walkover.result.payments.filter(row => row.kind === "prize" && row.asset.token === ZERO_ADDRESS)
    .reduce((sum, row) => sum + BigInt(row.amount), BigInt(0)), BigInt(11114));
  const wrong = clone(walkover.result); wrong.payments[0].beneficiary = address(999);
  assert.throws(() => validateResult(walkover.manifest, walkover.registry.version, walkover.qualification, wrong), /allocation/);
});
test("unknown infrastructure checks and ineligible winners cannot become outcomes", () => {
  const unknown = clone(played.qualification); unknown.entrants[0].status = "unknown"; unknown.entrants[0].reason = "infrastructure_unavailable";
  const result = clone(played.result); result.qualificationHash = hashDocument(unknown);
  assert.throws(() => validateResult(played.manifest, played.registry.version, unknown, result), /unknown checkpoint/);
  const noShowWinner = clone(walkover.result); noShowWinner.placements = [walkover.manifest.roster[0].championId];
  assert.throws(() => validateResult(walkover.manifest, walkover.registry.version, walkover.qualification, noShowWinner), /eligible starters/);
  const nullBlock = clone(played.qualification); nullBlock.checkpoint = null;
  assert.throws(() => validateQualification(played.manifest, nullBlock), /checkpoint/);
});
test("replay rejects private top-level fields, tampering, wrong order, and fake walkover battles", () => {
  const secret = { ...played.replay, privateSheets: [{ aggression: 80 }] };
  assert.throws(() => validateReplay(played.manifest, played.registry.version, played.result, secret));
  const bad = clone(played.replay); bad.events[1].seq = 7;
  assert.throws(() => validateReplay(played.manifest, played.registry.version, played.result, bad), /sequence/);
  const fake = clone(walkover.replay); fake.events = clone(played.replay.events);
  assert.throws(() => validateReplay(walkover.manifest, walkover.registry.version, walkover.result, fake), /invent simulation/);
});
test("cancellation example returns original sources without fees, including no-shows", async () => {
  const f = await fixture<ReturnType<typeof import("../scripts/fixture-data.js").makeCancellation>>("cancellation");
  validateCancellation(f.manifest, f.registry.cancellation, f.cancellation, f.qualification);
  assert.equal(f.cancellation.returns.filter(row => row.kind === "reservation_release").length, 4);
  assert(f.cancellation.returns.every(row => !["treasury", "prize"].includes(row.kind)));
  const wrong = clone(f.cancellation); wrong.returns[0].beneficiary = f.manifest.roster[0].payout;
  assert.throws(() => validateCancellation(f.manifest, f.registry.cancellation, wrong, f.qualification), /preserve funders/);
  const phase = clone(f.cancellation); phase.phase = "seeded";
  assert.throws(() => validateCancellation(f.manifest, f.registry.cancellation, phase, f.qualification), /zero-qualified evidence/);
  const early = clone(f.cancellation); early.cancelledAt = "999";
  assert.throws(() => validateCancellation(f.manifest, f.registry.cancellation, early, f.qualification), /precedes evidence/);
});
test("ABI commitments match frozen vectors and isolate domains and time gates", () => {
  for (const f of [played, walkover]) {
    const input = { resultHash: hashResult(f.result), replayHash: f.opening.replayHash,
      seedCommitment: f.opening.seedCommitment, sealedEnvelopeHash: f.opening.sealedEnvelopeHash, nonce: f.opening.nonce };
    assert.equal(encodeResult(f.manifest, input), f.vectors.resultAbi);
    assert.equal(encodeOutcome(f.result), f.vectors.outcomeAbi);
    assert.equal(commitResult(f.manifest, input), f.vectors.resultCommitment);
    assert.equal(keccak256(f.vectors.resultAbi), f.vectors.resultCommitment);
    for (const field of ["board", "matchId", "eventId"] as const) {
      const manifest = clone(f.manifest); manifest[field] = field === "board" ? address(777) : id(777);
      assert.notEqual(commitResult(manifest, input), f.vectors.resultCommitment);
    }
    const manifest = clone(f.manifest); manifest.schedule.revealAt = "1401";
    assert.notEqual(commitResult(manifest, input), f.vectors.resultCommitment);
    assert.notEqual(commitResult(f.manifest, { ...input, nonce: id(777) }), f.vectors.resultCommitment);
  }
  assert.equal(encodeSeed(played.manifest, played.opening.seed!), played.vectors.seedAbi);
});
test("AES authentication and public opening verify against supplied commitments", async () => {
  for (const f of [played, walkover]) {
    const verified = await verifyPublishedPackage({ ...f, now: "1400" });
    assert.equal(verified.assurance, "matches_supplied_receipt");
    assert.deepEqual(verified.result, f.result);
    assert(verified.requiresIndependentVerification.includes("chain_inclusion_and_finality"));
    await assert.rejects(() => verifyPublishedPackage({ ...f, now: "1399" }), /NOT_RELEASED/);
    await assert.rejects(() => decryptPayload(f.manifest, f.envelope, id(999)));
  }
  const f = clone(played); f.opening.replayHash = id(999);
  await assert.rejects(() => verifyPublishedPackage({ ...f, now: "1400" }), /replay hash/);
  const damaged = clone(played.envelope); damaged.ciphertext = `${damaged.ciphertext.slice(0, -2)}${damaged.ciphertext.endsWith("ff") ? "00" : "ff"}`;
  await assert.rejects(() => decryptPayload(played.manifest, damaged, played.opening.encryptionKey));
});
test("handler typed data has stable EIP-712 hashing and binds version, nonce and board", async () => {
  const f = await fixture<{ authorization: Record<string, unknown>; typedDataHash: string }>("handler-authorization");
  assert.equal(handlerAuthorizationHash(f.authorization), f.typedDataHash);
  for (const changed of [{ nonce: "8" }, { version: "2" }, { board: address(555) }, { permissionsHash: id(555) }]) {
    assert.notEqual(handlerAuthorizationHash({ ...f.authorization, ...changed }), f.typedDataHash);
  }
  const account = privateKeyToAccount(`0x${"22".repeat(32)}`); // Public fixture-only account; no network.
  const signature = await account.signTypedData(handlerTypedData(f.authorization));
  assert.match(signature, /^0x[0-9a-f]{130}$/);
});
test("free casual uses an authenticated AgentBorn signature without a chain checkpoint", async () => {
  const f = await fixture<Awaited<ReturnType<typeof import("../scripts/fixture-data.js").makeCasual>>>("casual");
  assert.equal(f.qualification.checkpoint, null);
  const result = await verifyCasualPackage({ ...f, trustedKeyId: f.signal.keyId, now: "1400" });
  assert.equal(result.assurance, "signed_casual_only");
  await assert.rejects(() => verifyCasualPackage({ ...f, trustedKeyId: id(999), now: "1400" }), /key identity/);
  await assert.rejects(() => verifyCasualPackage({ ...f, trustedKeyId: f.signal.keyId, now: "1399" }), /release time/);
  await assert.rejects(() => verifyCasualPackage({ ...f, manifest: played.manifest, trustedKeyId: f.signal.keyId, now: "1400" }), /funded results/);
});
test("studio requests sign the body hash, method, target, game, time and nonce", async () => {
  const f = await fixture<Awaited<ReturnType<typeof import("../scripts/fixture-data.js").makeStudioRequest>>>("studio-request");
  assert.equal(bytesToHex(studioSigningBytes(f.request)), f.signedMessageHex);
  assert(await verifyEd25519(hexToBytes(f.signedMessageHex), f.signature, f.publicKey));
  assert.equal(await verifyEd25519(studioSigningBytes({ ...f.request, nonce: id(999) }), f.signature, f.publicKey), false);
});
test("public client downloads one complete package and sends credentials only for studio retrieval", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createProtocolClient({ origin: "https://example.test", studioHeaders: async () => ({ "x-agentborn-key-id": id(77) }),
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(canonicalJson(played.replay), { headers: { "content-type": "application/json" } });
    } });
  assert.deepEqual(await client.studioPackage(played.manifest.matchId), played.replay);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init?.redirect, "error");
  assert.equal(requests[0].init?.credentials, "omit");
  await client.replay(played.manifest.matchId);
  assert.equal((requests[1].init?.headers as Record<string, string>)["x-agentborn-key-id"], undefined);
  assert.throws(() => createProtocolClient({ origin: "https://user:password@example.test" }));
  assert.throws(() => createProtocolClient({ origin: "http://example.test" }));
});
test("early public opening and wrong protocol errors never downgrade to v1", async () => {
  let calls = 0;
  const client = createProtocolClient({ origin: "https://example.test", fetch: async () => {
    calls++;
    return new Response(canonicalJson({ protocol: PROTOCOL, revision: REVISION, requestId: id(88), code: "NOT_RELEASED",
      message: "Opening is scheduled for later", retryable: true }), { status: 425, headers: { "content-type": "application/json" } });
  } });
  await assert.rejects(() => client.opening(played.manifest.matchId), (error: unknown) => error instanceof ProtocolResponseError && error.code === "NOT_RELEASED");
  assert.equal(calls, 1);
  assert.throws(() => parseDocument(matchManifestSchema, { ...played.manifest, protocol: "agentborn/1" }));
});
test("public verification inputs can be fetched without studio authority", async () => {
  const artifacts: Record<string, unknown> = { manifest: played.manifest, registry: played.registry,
    qualification: played.qualification, result: played.result };
  const client = createProtocolClient({ origin: "https://example.test",
    studioHeaders: async () => { throw new Error("public read requested studio authority"); },
    fetch: async (input) => new Response(canonicalJson(artifacts[String(input).split("/").at(-1)!]),
      { headers: { "content-type": "application/json" } }) });
  const id = played.manifest.matchId;
  assert.deepEqual(await client.manifest(id), played.manifest);
  assert.deepEqual(await client.registry(id), played.registry);
  assert.deepEqual(await client.qualification(id), played.qualification);
  assert.deepEqual(await client.result(id), played.result);
});
test("fixture generation is reproducible and reviewed ciphertext stays stable", async () => {
  const generated = await makeOutcome("played");
  assert.deepEqual(generated, played);
  assert.equal(hashDocument(played.envelope, ENVELOPE_BYTES), played.vectors.sealedEnvelopeHash);
  assert.notEqual(played.opening.nonce, ZERO_HASH);
});
