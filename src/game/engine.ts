import type {
  Action,
  CombatEvent,
  CombatState,
  Entrant,
  FighterState,
  Strategy,
} from "./types.ts";
export const RULES_VERSION = 2;
export const MAX_ROUNDS = 24;
export const DEFAULT_STRATEGY: Strategy = {
  aggression: 50,
  feint_rate: 25,
  recover_below: 2,
};
export function validateStrategy(raw: unknown): Strategy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Strategy must be an object");
  const value = { ...DEFAULT_STRATEGY, ...raw } as Strategy;
  for (const [key, max] of [
    ["aggression", 100],
    ["feint_rate", 100],
    ["recover_below", 4],
  ] as const) {
    if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > max)
      throw Object.assign(new Error("Invalid strategy: " + key), {
        status: 400,
      });
  }
  return {
    aggression: value.aggression,
    feint_rate: value.feint_rate,
    recover_below: value.recover_below,
  };
}
export function initialState(
  seed: number,
  rules: 1 | 2 = RULES_VERSION,
): CombatState {
  return {
    rules,
    seed: seed >>> 0,
    rng: seed >>> 0,
    round: 0,
    fighters: [
      { health: 100, stamina: 6, damage: 0 },
      { health: 100, stamina: 6, damage: 0 },
    ],
    winner: null,
    reason: null,
  };
}
function random(state: CombatState) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function choose(
  f: FighterState,
  s: Strategy,
  a: number,
  b: number,
): [Action, boolean] {
  if (f.stamina < s.recover_below) return ["recover", false];
  if (a >= 0.25 + 0.005 * s.aggression) return ["guard", false];
  const action: Action =
    f.stamina >= 3 && b < s.feint_rate / 100 ? "feint" : "strike";
  return f.stamina < 2 ? ["recover", true] : [action, false];
}
function hit(action: Action, defense: Action, rules: number) {
  return action === "strike"
    ? defense === "guard"
      ? 3
      : 12
    : action === "feint"
      ? defense === "guard"
        ? 10
        : 6
      : rules >= 2 && action === "guard" && defense === "strike"
        ? 6
        : 0;
}
export function step(
  previous: CombatState,
  entrants: Pick<Entrant, "identity" | "strategy">[],
  at: number,
): { state: CombatState; event: CombatEvent } {
  if (
    ![1, RULES_VERSION].includes(previous.rules) ||
    previous.winner !== null ||
    entrants.length !== 2
  )
    throw new Error("Fight cannot advance");
  const state = structuredClone(previous);
  const decisions = [0, 1].map((i) =>
    choose(
      state.fighters[i],
      entrants[i].strategy,
      random(state),
      random(state),
    ),
  );
  const actions = decisions.map((d) => d[0]) as [Action, Action];
  const damage: [number, number] = [
    hit(actions[1], actions[0], state.rules),
    hit(actions[0], actions[1], state.rules),
  ];
  state.fighters = state.fighters.map((f, i) => ({
    health: Math.max(0, f.health - damage[i]),
    stamina: Math.min(
      6,
      Math.max(
        0,
        f.stamina + { strike: -2, feint: -3, guard: 1, recover: 3 }[actions[i]],
      ),
    ),
    damage: f.damage + Math.min(previous.fighters[1 - i].health, damage[1 - i]),
  })) as [FighterState, FighterState];
  state.round++;
  const [a, b] = state.fighters;
  if (!a.health || !b.health || state.round >= MAX_ROUNDS) {
    if (a.health !== b.health) {
      state.winner = a.health > b.health ? 0 : 1;
      state.reason =
        !a.health || !b.health ? "Knockout" : "Decision · remaining health";
    } else if (a.damage !== b.damage) {
      state.winner = a.damage > b.damage ? 0 : 1;
      state.reason = "Decision · damage dealt";
    } else {
      state.winner = random(state) < 0.5 ? 0 : 1;
      state.reason = "Decision · seeded tie-break";
    }
  }
  const captions = actions.map((action, i) => {
    const name = entrants[i].identity.name;
    if (decisions[i][1]) return name + " is exhausted and must recover";
    if (state.rules >= 2 && action === "guard" && actions[1 - i] === "strike")
      return name + " guards and counters the strike";
    if (action === "feint" && actions[1 - i] === "guard")
      return name + " slips a feint through the guard";
    return (
      name +
      " " +
      {
        strike: "strikes",
        feint: "feints",
        guard: "raises their shield",
        recover: "recovers stamina",
      }[action]
    );
  });
  return {
    state,
    event: {
      seq: state.round,
      at,
      actions,
      states: structuredClone(state.fighters),
      damage,
      forced: decisions.map((d) => d[1]) as [boolean, boolean],
      caption: captions.join(". ") + ".",
    },
  };
}
export function simulate(seed: number, entrants: Entrant[], at = 0) {
  let state = initialState(seed);
  const events: CombatEvent[] = [];
  while (state.winner === null) {
    const next = step(state, entrants, at + events.length * 1000);
    state = next.state;
    events.push(next.event);
  }
  return { state, events };
}
export function turningPoint(events: CombatEvent[]) {
  if (!events.length) return null;
  const important =
    events.findLast(
      (e) =>
        e.forced.some(Boolean) ||
        e.actions.some((a, i) => a === "feint" && e.actions[1 - i] === "guard"),
    ) ?? events.at(-1)!;
  return {
    from: Math.max(1, important.seq - 2),
    to: Math.min(events.length, important.seq + 2),
    text: important.caption,
  };
}
