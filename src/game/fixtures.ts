import type { Entrant } from "./types.ts";
export const HOUSE: Entrant[] = [
  {
    identity: {
      id: "house-rook",
      name: "Rook",
      portrait: "/portraits/rook.svg",
      color: "#e8b96b",
      title: "THE IRON RESOLVE",
      fact: "Pressure. Patience. A shield that holds.",
    },
    strategy: { aggression: 85, feint_rate: 10, recover_below: 1 },
  },
  {
    identity: {
      id: "house-nyx",
      name: "Nyx",
      portrait: "/portraits/nyx.svg",
      color: "#8fd2cb",
      title: "THE QUIET THREAT",
      fact: "A patient guard hides a dangerous feint.",
    },
    strategy: { aggression: 55, feint_rate: 80, recover_below: 2 },
  },
  {
    identity: {
      id: "house-sentinel",
      name: "Sentinel",
      portrait: "/portraits/sentinel.svg",
      color: "#aaa0d4",
      title: "THE LAST BASTION",
      fact: "Every opening has a price.",
    },
    strategy: { aggression: 25, feint_rate: 20, recover_below: 3 },
  },
];
