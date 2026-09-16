"""Independent Python oracle for the published AgentBorn duel fixtures.

Consumes only JSON rules and fixtures, never AgentBorn's TypeScript engine.
Requires PyCryptodome, as does the protocol's existing conformance oracle.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if (ROOT / ".python-tools").exists():
    sys.path.insert(0, str(ROOT / ".python-tools"))
from Crypto.Hash import keccak


REVISION = "a3.duel.1"
PROTOCOL = "agentborn/2"
UINT32_RANGE = 1 << 32
RNG_SPEC = {
    "id": "agentborn/keccak256-counter/1",
    "domain": "agentborn.duel.rng.1",
    "block": "keccak256(canonicalJson({domain,seed,counter}))",
    "counter": "decimal string starting at 0",
    "words": "eight big-endian uint32 words per block, left to right",
    "draws": "four per round; one extra for a final tie",
}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def canonical(value):
    """The fixture subset of canonical JSON: ASCII and safe integers only."""
    def validate(item, depth=0):
        require(depth <= 32, "canonical JSON depth")
        if item is None or isinstance(item, bool):
            return
        if isinstance(item, int):
            require(abs(item) <= 9007199254740991, "unsafe JSON integer")
        elif isinstance(item, str):
            require(item.isascii(), "fixture strings must be ASCII")
        elif isinstance(item, list):
            for child in item:
                validate(child, depth + 1)
        elif isinstance(item, dict):
            for key, child in item.items():
                require(isinstance(key, str) and
                        re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", key) and
                        key not in ("constructor", "prototype"),
                        "invalid canonical JSON key")
                validate(child, depth + 1)
        else:
            raise AssertionError("unsupported canonical JSON value")
    validate(value)
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":")).encode("utf-8")


def digest(data):
    return "0x" + keccak.new(digest_bits=256, data=data).hexdigest()


def document(value):
    return digest(canonical(value))


def rng_block(seed, counter):
    require(isinstance(seed, str) and
            re.fullmatch(r"0x[0-9a-f]{64}", seed), "invalid RNG seed")
    require(type(counter) is int and counter >= 0, "invalid RNG counter")
    block_hash = document({"domain": RNG_SPEC["domain"], "seed": seed,
                           "counter": str(counter)})
    raw = bytes.fromhex(block_hash[2:])
    words = [int.from_bytes(raw[offset:offset + 4], "big")
             for offset in range(0, 32, 4)]
    return block_hash, words


class RandomStream:
    def __init__(self, seed):
        self.seed = seed
        self.words = []
        self.draws = 0
        self.blocks = 0

    def draw(self):
        if not self.words:
            _, self.words = rng_block(self.seed, self.blocks)
            self.blocks += 1
        value = self.words.pop(0)
        self.draws += 1
        return value


def choose(fighter, strategy, first, second, rules):
    stamina = fighter["stamina"]
    if stamina < strategy["recover_below"]:
        return "recover", False
    attack_bps = (rules["attack"]["baseBps"] +
                  strategy["aggression"] * rules["attack"]["aggressionBps"])
    if first * 10000 >= attack_bps * UINT32_RANGE:
        return "guard", False
    if stamina < rules["stamina"]["strikeCost"]:
        return "recover", True
    if (stamina >= rules["stamina"]["feintCost"] and
            second * 10000 < strategy["feint_rate"] * 100 * UINT32_RANGE):
        return "feint", False
    return "strike", False


def damage(attacker, defender, rules):
    table = rules["damage"]
    if attacker == "strike":
        return table["guardedStrike"] if defender == "guard" else table["strike"]
    if attacker == "feint":
        return table["guardedFeint"] if defender == "guard" else table["feint"]
    if attacker == "guard" and defender == "strike":
        return table["counter"]
    return 0


def simulate(value):
    require(value["protocol"] == PROTOCOL and
            value["revision"] == REVISION and
            value["kind"] == "duel_input", "input envelope")
    rules = value["rules"]
    require(rules["protocol"] == PROTOCOL and rules["revision"] == REVISION and
            rules["kind"] == "duel_rules" and
            rules["runtimeId"] == "agentborn/duel/1" and
            rules["rngId"] == RNG_SPEC["id"] and
            rules["tieBreak"] == "remaining_health_then_damage_then_seeded_coin",
            "rules envelope")
    entrants = value["entrants"]
    require(len(entrants) == 2 and
            entrants[0]["championId"] != entrants[1]["championId"], "duel roster")
    require(1 <= rules["maxRounds"] <= 1024, "duel round bound")
    fighters = [{"health": rules["health"], "stamina": rules["stamina"]["max"],
                 "damage": 0} for _ in entrants]
    deltas = {"strike": -rules["stamina"]["strikeCost"],
              "feint": -rules["stamina"]["feintCost"],
              "guard": rules["stamina"]["guardGain"],
              "recover": rules["stamina"]["recoverGain"]}
    random = RandomStream(value["seed"])
    events = []
    winner = None
    reason = None
    for round_index in range(rules["maxRounds"]):
        # Every fighter consumes both draws, even if recovery was inevitable.
        decisions = []
        for side in range(2):
            first, second = random.draw(), random.draw()
            decisions.append(choose(fighters[side], entrants[side]["strategy"],
                                    first, second, rules))
        actions = [decision[0] for decision in decisions]
        received = [min(fighters[side]["health"],
                        damage(actions[1 - side], actions[side], rules))
                    for side in range(2)]
        fighters = [{
            "health": fighters[side]["health"] - received[side],
            "stamina": min(rules["stamina"]["max"],
                           max(0, fighters[side]["stamina"] + deltas[actions[side]])),
            "damage": fighters[side]["damage"] + received[1 - side],
        } for side in range(2)]
        events.append({"seq": round_index,
                       "atMs": (round_index + 1) * rules["roundMs"],
                       "actions": actions,
                       "fighters": [fighter.copy() for fighter in fighters],
                       "damageReceived": received,
                       "forced": [decision[1] for decision in decisions]})
        knockout = any(fighter["health"] == 0 for fighter in fighters)
        if knockout or round_index + 1 == rules["maxRounds"]:
            first, second = fighters
            if first["health"] != second["health"]:
                winner = 0 if first["health"] > second["health"] else 1
                reason = "knockout" if knockout else "remaining_health"
            elif first["damage"] != second["damage"]:
                winner = 0 if first["damage"] > second["damage"] else 1
                reason = "damage_dealt"
            else:
                winner = 0 if random.draw() < UINT32_RANGE // 2 else 1
                reason = "seeded_tie_break"
            break
    require(winner is not None, "duel did not terminate")
    ids = [entrant["championId"] for entrant in entrants]
    return {
        "protocol": PROTOCOL, "revision": REVISION, "kind": "duel_simulation",
        "inputHash": document(value), "rulesHash": document(rules),
        "winnerId": ids[winner], "placements": [ids[winner], ids[1 - winner]],
        "reason": reason, "rounds": len(events), "events": events,
        "finalState": fighters,
        "usage": {"work": len(events) + random.draws + random.blocks,
                  "randomDraws": random.draws, "hashBlocks": random.blocks},
    }


def check_equal(actual, expected, label):
    require(actual == expected,
            label + " mismatch\nactual=" + canonical(actual).decode("utf-8") +
            "\nexpected=" + canonical(expected).decode("utf-8"))


def main():
    with (ROOT / "fixtures" / "duel.json").open(encoding="utf-8") as source:
        fixture = json.load(source)
    require(fixture["fixtureOnly"] is True, "not a fixture-only document")
    check_equal(fixture["revision"], REVISION, "fixture revision")
    check_equal(fixture["rngSpec"], RNG_SPEC, "RNG specification")
    check_equal(fixture["rngHash"], document(RNG_SPEC), "RNG specification hash")
    with (ROOT / "fixtures" / "duel-rules.json").open(encoding="utf-8") as source:
        rules = json.load(source)
    check_equal(fixture["rules"], rules, "published rules")
    check_equal(fixture["rulesHash"], document(rules), "rules hash")
    require(len(fixture["rngVectors"]) > 0 and len(fixture["cases"]) > 0,
            "empty conformance fixture")
    for vector in fixture["rngVectors"]:
        counter = vector["counter"]
        if isinstance(counter, str):
            require(re.fullmatch(r"0|[1-9][0-9]*", counter), "RNG counter format")
            counter = int(counter)
        block_hash, words = rng_block(vector["seed"], counter)
        label = "RNG " + vector["seed"] + "/" + str(counter)
        check_equal(vector["hash"], block_hash, label + " hash")
        check_equal(vector["words"], words, label + " words")
    names = set()
    for case in fixture["cases"]:
        name = case["name"]
        require(name not in names, "duplicate fixture case name")
        names.add(name)
        output = simulate(case["input"])
        check_equal(case["output"], output, name + " output")
        check_equal(case["outputHash"], document(output), name + " output hash")
    print("Independent Python duel conformance: " + str(len(names)) +
          " cases and " + str(len(fixture["rngVectors"])) + " RNG vectors passed.")


if __name__ == "__main__":
    main()
