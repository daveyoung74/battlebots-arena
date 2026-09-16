"""Independent Python verification of published ABI, JSON, payment, AES and signature vectors.

Uses PyCryptodome, never the TypeScript implementation or a blockchain connection.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if (ROOT / ".python-tools").exists():
    sys.path.insert(0, str(ROOT / ".python-tools"))
from Crypto.Hash import keccak
from Crypto.Cipher import AES
from Crypto.Signature import eddsa


def canonical(value):
    def validate(item, depth=0):
        assert depth <= 32
        if item is None or isinstance(item, bool):
            return
        if isinstance(item, int):
            assert abs(item) <= 9007199254740991
        elif isinstance(item, str):
            assert not any(0xD800 <= ord(c) <= 0xDFFF for c in item)
        elif isinstance(item, list):
            for child in item:
                validate(child, depth + 1)
        elif isinstance(item, dict):
            for key, child in item.items():
                assert re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", key)
                assert key not in ("constructor", "prototype")
                validate(child, depth + 1)
        else:
            raise AssertionError("unsupported canonical value")
    validate(value)
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(data):
    return "0x" + keccak.new(digest_bits=256, data=data).hexdigest()


def document(value):
    return digest(canonical(value))


def raw(value):
    return bytes.fromhex(value.removeprefix("0x"))


def word(value):
    if isinstance(value, str) and value.startswith("0x"):
        encoded = raw(value)
        assert len(encoded) <= 32
        return encoded.rjust(32, b"\x00")
    value = int(value)
    assert 0 <= value < 2**256
    return value.to_bytes(32, "big")


def tag(kind):
    return digest(f"AgentBorn.v2.{kind}.2.0.0-alpha.1".encode())


def context(manifest):
    return [manifest["chainId"], manifest["board"], manifest["eventId"], manifest["matchId"], document(manifest)]


def encode_seed(manifest, seed):
    return b"".join(map(word, [tag("seed"), *context(manifest), seed]))


def encode_outcome(result):
    # Eight ABI head words; the final three point to arrays of static elements.
    placements = word(len(result["placements"])) + b"".join(map(word, result["placements"]))
    shares = word(len(result["sharesBps"])) + b"".join(map(word, result["sharesBps"]))
    kinds = {"treasury": 0, "prize": 1, "return": 2, "reservation_release": 3}
    payments = word(len(result["payments"]))
    for payment in result["payments"]:
        payments += b"".join(map(word, [payment["sourceId"], payment["asset"]["chainId"], payment["asset"]["token"],
            kinds[payment["kind"]], payment["beneficiary"], payment["championId"] or 0, payment["amount"]]))
    offset = 8 * 32
    head = [tag("outcome"), result["matchId"], result["manifestHash"], result["qualificationHash"],
        0 if result["kind"] == "played" else 1, offset, offset + len(placements), offset + len(placements) + len(shares)]
    return b"".join(map(word, head)) + placements + shares + payments


def expected_payments(manifest, result):
    rows = []
    roster = {row["championId"]: row for row in manifest["roster"]}
    for source in manifest["sources"]:
        gross = int(source["grossAmount"])
        fee = 0 if source["kind"] == "sponsor" else gross * 100 // 10000
        net = gross - fee
        assert source["feeAmount"] == str(fee) and source["netAmount"] == str(net)
        common = {"sourceId": source["sourceId"], "asset": source["asset"]}
        if fee:
            rows.append({**common, "kind": "treasury", "beneficiary": manifest["treasury"], "championId": None, "amount": str(fee)})
        amounts = [net * share // 10000 for share in result["sharesBps"]]
        amounts[0] += net - sum(amounts)
        for champion, amount in zip(result["placements"], amounts):
            if amount:
                rows.append({**common, "kind": "prize", "beneficiary": roster[champion]["payout"], "championId": champion, "amount": str(amount)})
    return rows


def load(name):
    return json.loads((ROOT / "fixtures" / f"{name}.json").read_text(encoding="utf-8"))


assert digest(b"") == "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
for vector in load("canonical"):
    assert canonical(vector["value"]).decode() == vector["canonical"]
    assert document(vector["value"]) == vector["keccak256"]

for name in ("played", "walkover"):
    f = load(name)
    m, result, opening, vectors, envelope = (f[key] for key in ("manifest", "result", "opening", "vectors", "envelope"))
    assert document(m) == vectors["manifestHash"]
    assert result["payments"] == expected_payments(m, result)
    outcome = encode_outcome(result)
    assert "0x" + outcome.hex() == vectors["outcomeAbi"]
    assert digest(outcome) == vectors["resultHash"]
    if opening["seed"]:
        seed = encode_seed(m, opening["seed"])
        assert "0x" + seed.hex() == vectors["seedAbi"]
        assert digest(seed) == vectors["seedCommitment"]
    else:
        assert vectors["seedCommitment"] == "0x" + "0" * 64
    encoded = b"".join(map(word, [tag("result"), *context(m), vectors["resultHash"], document(f["replay"]),
        vectors["seedCommitment"], document(envelope), m["schedule"]["revealAt"], m["schedule"]["settlementNotBefore"], opening["nonce"]]))
    assert "0x" + encoded.hex() == vectors["resultAbi"]
    assert digest(encoded) == vectors["resultCommitment"] == f["receipt"]["resultCommitment"]
    aad = canonical({"protocol": m["protocol"], "revision": m["revision"], "chainId": m["chainId"], "board": m["board"],
        "eventId": m["eventId"], "matchId": m["matchId"], "manifestHash": document(m),
        "revealAt": m["schedule"]["revealAt"], "settlementNotBefore": m["schedule"]["settlementNotBefore"]})
    assert digest(aad) == envelope["aadHash"]
    aes = AES.new(raw(opening["encryptionKey"]), AES.MODE_GCM, nonce=raw(envelope["iv"]), mac_len=16)
    aes.update(aad)
    ciphertext = raw(envelope["ciphertext"])
    decoded = aes.decrypt_and_verify(ciphertext[:-16], ciphertext[-16:])
    payload = json.loads(decoded)
    assert decoded == canonical(payload)
    assert payload == {"result": result, "replay": f["replay"], "seed": opening["seed"],
        "seedCommitment": opening["seedCommitment"], "nonce": opening["nonce"]}
    print(f"PASS Python {name}: canonical hashes, dynamic/static ABI, payments and authenticated decryption")

c = load("cancellation")
for source in c["manifest"]["sources"]:
    returns = [row for row in c["cancellation"]["returns"] if row["sourceId"] == source["sourceId"]]
    assert sum(int(row["amount"]) for row in returns) == int(source["grossAmount"])
    assert all(row["kind"] in ("return", "reservation_release") for row in returns)
    if source["kind"] == "vault":
        assert returns[0]["beneficiary"] == source["contract"] and returns[0]["kind"] == "reservation_release"
    else:
        assert [row["beneficiary"] for row in returns] == [row["funder"] for row in source["deposits"]]
assert document(c["cancellation"]) == c["cancellationHash"]
print("PASS Python cancellation: full original-source returns, no fees")

a = load("handler-authorization")
auth = a["authorization"]
domain_type = digest(b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
domain_hash = digest(b"".join(map(word, [domain_type, digest(b"AgentBornHandlerV2"), digest(b"2.0.0-alpha.1"), auth["chainId"], auth["board"]])))
message_type = digest(b"HandlerPermissions(bytes32 handlerId,bytes32 championId,bytes32 permissionsHash,uint256 version,uint256 nonce,uint64 validAfter,uint64 validUntil)")
message_hash = digest(b"".join(map(word, [message_type, auth["handlerId"], auth["championId"], auth["permissionsHash"], auth["version"], auth["nonce"], auth["validAfter"], auth["validUntil"]])))
assert digest(b"\x19\x01" + raw(domain_hash) + raw(message_hash)) == a["typedDataHash"]
print("PASS Python handler EIP-712 domain/message digest")

for name in ("casual", "studio-request"):
    f = load(name)
    if name == "casual":
        message = {key: value for key, value in f["signal"].items() if key != "signature"}
        signature = f["signal"]["signature"]
        assert f["manifest"]["sources"] == [] and f["qualification"]["checkpoint"] is None
        assert digest(encode_outcome(f["result"])) == message["resultHash"]
    else:
        message, signature = f["request"], f["signature"]
    assert canonical(message) == raw(f["signedMessageHex"])
    eddsa.new(eddsa.import_public_key(raw(f["publicKey"])), "rfc8032").verify(canonical(message), raw(signature))
    print(f"PASS Python {name}: canonical Ed25519 signature")

t = load("training")
assert t["policy"] == {"protocol": "agentborn/2", "revision": "a0.training.1", "kind": "training_policy",
    "scope": "champion_game", "startsAt": "first_validated_played_free_completion", "durationSeconds": "604800",
    "matchCountAlternative": None, "paidEarlyAccess": False}
assert document(t["policy"]) == t["policyHash"]
manifest, bundle = t["manifest"], t["bundle"]
assert manifest["revision"] == "2.0.0-alpha.1" and manifest["sources"]
assert bundle["policy"] == t["policy"] and bundle["checkpoint"] == t["checkpoint"]
assert document(manifest) == bundle["manifestHash"] == t["hashes"]["manifest"]
assert document(bundle) == t["hashes"]["bundle"]
assert len(bundle["entries"]) == len(manifest["roster"])
context = json.loads(json.dumps(manifest))
for entry in context["roster"]:
    entry["admissionEvidenceHash"] = "0x" + "00" * 32
context_hash = document({"protocol": "agentborn/2", "revision": "a0.training.1",
    "kind": "training_manifest_context", "manifest": context})
casual = load("casual")
for i, row in enumerate(bundle["entries"]):
    admission, progress = row["admission"], row["progress"]
    first = progress["firstCompletion"]
    assert admission["championId"] == progress["championId"] == first["championId"] == manifest["roster"][i]["championId"]
    assert admission["gameId"] == progress["gameId"] == first["gameId"] == manifest["identity"]["gameId"]
    assert admission["checkpoint"] == progress["checkpoint"] == t["checkpoint"]
    assert admission["policyHash"] == t["policyHash"] and admission["manifestContextHash"] == context_hash
    assert admission["progressHash"] == document(progress)
    assert admission["ordinaryAdmissionEvidenceHash"] == t["ordinaryManifest"]["roster"][i]["admissionEvidenceHash"]
    assert admission["revalidationEvidenceHash"] == t["ordinaryManifest"]["roster"][i]["admissionEvidenceHash"]
    assert document(admission) == manifest["roster"][i]["admissionEvidenceHash"] == t["hashes"]["admissions"][i]
    assert first["matchId"] == casual["manifest"]["matchId"] and first["manifestHash"] == document(casual["manifest"])
    assert first["resultHash"] == digest(encode_outcome(casual["result"]))
    assert first["qualificationHash"] == document(casual["qualification"]) and progress["validatedMatchCount"] == "1"
    assert int(first["completedAt"]) + 604800 <= int(t["checkpoint"]["timestamp"]) < int(manifest["schedule"]["enrollmentClosesAt"])
for row in t["snapshots"]:
    progress, decision = row["progress"], row["decision"]
    start = int(progress["firstCompletion"]["completedAt"])
    remaining = max(0, start + 604800 - int(decision["evaluatedAt"]))
    assert decision["progressHash"] == document(progress) and decision["policyHash"] == t["policyHash"]
    assert decision["trainingStartedAt"] == str(start) and decision["purseEligibleAt"] == str(start + 604800)
    assert decision["remainingSeconds"] == str(remaining)
    assert decision["status"] == ("eligible" if remaining == 0 else "training")
print("PASS Python training: exact seven-day boundary, per-game scope, complete roster and composed admission hashes")

print("Independent conformance passed; no network or wallet access.")
