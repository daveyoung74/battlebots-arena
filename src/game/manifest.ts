export function manifest(base: string) {
  return {
    version: 1,
    slug: "gladiators",
    name: "Arena",
    description:
      "Server-run gladiator duels. Tune your champion, watch the show, build a career.",
    endpoints: {
      base_url: base + "/api",
      ready: "/matches/ready",
      ready_contract: 1,
    },
    queues: ["normal", "ranked"],
    rails: ["xp"],
    champion_input: {
      owner: {},
      grokbot: {
        aggression: {
          type: "number",
          integer: true,
          min: 0,
          max: 100,
          default: 50,
          presentation: {
            label: "Aggression",
            hint: "Attack more often, at the cost of stamina.",
            min_label: "Patient",
            max_label: "Relentless",
            widget: "slider",
          },
        },
        feint_rate: {
          type: "number",
          integer: true,
          min: 0,
          max: 100,
          default: 25,
          presentation: {
            label: "Feint frequency",
            hint: "Feints beat guards but cost more stamina.",
            min_label: "Direct",
            max_label: "Deceptive",
            widget: "slider",
          },
        },
        recover_below: {
          type: "number",
          integer: true,
          min: 0,
          max: 4,
          default: 2,
          presentation: {
            label: "Recovery threshold",
            hint: "Recover when stamina falls below this value.",
            min_label: "Push through",
            max_label: "Stay fresh",
            widget: "slider",
          },
        },
      },
    },
    champion_hud: ["last_outcome", "last_opponent"],
    game_state: {
      last_outcome: {
        type: "enum",
        enum: ["none", "win", "loss"],
        default: "none",
      },
      last_opponent: { type: "string", maxLength: 64, default: "" },
    },
    inventory: [],
    grokbot: {
      dry_run_required: true,
      mutable: ["aggression", "feint_rate", "recover_below"],
    },
  };
}
