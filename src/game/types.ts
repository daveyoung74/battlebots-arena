export type Mode = "practice" | "casual" | "ranked" | "exhibition";
export type Strategy = {
  aggression: number;
  feint_rate: number;
  recover_below: number;
};
export type Identity = {
  id: string;
  name: string;
  handle?: string;
  portrait: string;
  color: string;
  title: string;
  fact: string;
  rivalry?: {
    text: string;
    evidence: Array<{ matchId: string; settleSeq: number; outcome?: string }>;
  };
  entrance?: ReturnType<typeof import("./broadcast.ts").entranceProfile>;
  token?: { symbol: string; url: string; mint: string };
};
export type Entrant = {
  identity: Identity;
  strategy: Strategy;
  acceptedAt?: number;
  ownerRef?: string;
};
export type Action = "strike" | "feint" | "guard" | "recover";
export type FighterState = { health: number; stamina: number; damage: number };
export type CombatEvent = {
  seq: number;
  at: number;
  actions: [Action, Action];
  states: [FighterState, FighterState];
  damage: [number, number];
  forced: [boolean, boolean];
  caption: string;
};
export type CombatState = {
  rules: 1 | 2;
  seed: number;
  rng: number;
  round: number;
  fighters: [FighterState, FighterState];
  winner: 0 | 1 | null;
  reason: string | null;
};
export type Cue = {
  id: string;
  at: number;
  expiresAt: number;
  text: string;
  kind: "entrance" | "reaction" | "finish";
  championId?: string;
  durationMs?: number;
  audio?: string;
};
export type Phase =
  | "waiting"
  | "entrance"
  | "live"
  | "interrupted"
  | "settling"
  | "wrapup"
  | "complete"
  | "cancelled";
export type ArenaMatch = {
  rulesVersion?: 1 | 2;
  platformCancellationConfirmed?: boolean;
  id: string;
  platformId: string | null;
  mode: Mode;
  visual: boolean;
  status:
    "waiting" | "ready" | "running" | "settling" | "complete" | "cancelled";
  entrants: Entrant[];
  accepted: string[];
  seed: number;
  combat: CombatState | null;
  events: CombatEvent[];
  cues: Cue[];
  createdAt: number;
  startsAt: number;
  nextTickAt: number;
  endedAt: number | null;
  settledAt: number | null;
  expiresAt: number;
  replayExpiresAt: number | null;
  revision: number;
  manifestVersion: number;
  result: { winner: number; reason: string } | null;
  lastError: string | null;
  headless: boolean;
  schedulePublished: boolean;
  rewardPolicy: "none" | "platform";
};
export type PublicMatch = {
  id: string;
  platformId: string | null;
  mode: Mode;
  phase: Phase;
  entranceCues: ReturnType<typeof import("./broadcast.ts").entranceCues>;
  entrants: Identity[];
  events: CombatEvent[];
  cues: Cue[];
  startsAt: number;
  endedAt: number | null;
  serverTime: number;
  result: ArenaMatch["result"];
  official: boolean;
  replayState: "pending" | "available" | "expired" | "unsupported";
  replayExpiresAt: number | null;
  revision: number;
  turningPoint: { from: number; to: number; text: string } | null;
  watchUrl: string;
};
