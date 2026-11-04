// Comparable ambient layers: metres, seconds and particles/second at full quality.
// Ranges are [minimum, maximum]; biome colours resolve at emission, never in the simulation RNG.
// Short-lived rain needs more emissions than long-lived snow: compare rate * life, not rate alone.
export const biomeAtmosphere = {
  yard: [
    {
      name: "rain",
      rate: 50,
      spread: [16, 13],
      height: [6, 9],
      velocity: [
        [-0.6, -0.6],
        [-19, -15],
        [0.3, 0.3],
      ],
      life: [0.5, 0.5],
      size: [0.05, 0.05],
      colors: [0x9fb4cc],
      drag: 0,
      spark: true,
    },
    {
      name: "splashes",
      rate: 11,
      spread: [14, 11],
      height: [0.05, 0.05],
      velocity: [
        [0, 0],
        [0.9, 0.9],
        [0, 0],
      ],
      life: [0.18, 0.18],
      size: [0.08, 0.08],
      colors: [0x9fb4cc],
      drag: 2,
    },
    {
      name: "street mist",
      rate: 1.6,
      spread: [14, 11],
      height: [0.25, 0.25],
      velocity: [
        [-0.2, 0.2],
        [0.015, 0.015],
        [-0.2, 0.2],
      ],
      life: [5, 5],
      size: [2.2, 2.2],
      colors: [0x5a6270],
      drag: 0,
      grow: 0.5,
    },
  ],
  vault: [
    {
      name: "aurora snow",
      rate: 34,
      spread: [17, 14],
      height: [2.5, 8.5],
      velocity: [
        [0.5, 0.8],
        [-1.9, -1.3],
        [0.15, 0.15],
      ],
      life: [4, 4],
      size: [0.1, 0.15],
      colors: [0xdcffe9, 0xdcffe9, 0xdcffe9, 0xf2d8ff],
      drag: 0,
    },
  ],
  marsh: [
    {
      name: "spores",
      rate: 9,
      spread: [15, 12],
      height: [0.3, 1.6],
      velocity: [
        [-0.2, 0.2],
        [0.15, 0.35],
        [-0.2, 0.2],
      ],
      life: [3.5, 3.5],
      size: [0.11, 0.17],
      colors: ["accent", "accent", "accent", "grid", "grid"],
      drag: 0.2,
    },
    {
      name: "water haze",
      rate: 4,
      spread: [15, 12],
      height: [0.25, 0.25],
      velocity: [
        [-0.15, 0.15],
        [0.02, 0.02],
        [-0.15, 0.15],
      ],
      life: [5, 5],
      size: [2.6, 2.6],
      colors: [0x081412],
      drag: 0,
      grow: 0.6,
    },
    {
      name: "fireflies",
      rate: 2.4,
      spread: [15, 12],
      height: [0.3, 1.2],
      velocity: [
        [-0.25, 0.25],
        [0.04, 0.14],
        [-0.25, 0.25],
      ],
      life: [4.5, 6.5],
      size: [0.1, 0.14],
      colors: [0xffd98a],
      drag: 0.9,
    },
  ],
  void: [
    {
      name: "rift motes",
      rate: 16,
      spread: [18, 15],
      height: [0.05, 0.05],
      velocity: [
        [0, 0],
        [0.6, 1.4],
        [0, 0],
      ],
      life: [3.5, 3.5],
      size: [0.07, 0.13],
      colors: ["accent", "accent", "grid", 0xffffff],
      drag: 0,
    },
  ],
  flats: [
    {
      name: "heat glints",
      rate: 11,
      spread: [15, 12],
      height: [0.15, 0.15],
      velocity: [
        [-0.25, 0.25],
        [0.9, 2.1],
        [-0.25, 0.25],
      ],
      life: [2.6, 2.6],
      size: [0.06, 0.1],
      colors: [0xffe9c4],
      drag: 0.4,
    },
    {
      name: "sand",
      rate: 7,
      spread: [17, 14],
      height: [0.3, 1.5],
      velocity: [
        [-0.8, 0.8],
        [-0.06, -0.06],
        [-0.8, 0.8],
      ],
      life: [3.2, 3.2],
      size: [0.08, 0.13],
      colors: [0xd8c8a8],
      drag: 0.9,
    },
  ],
  club: [
    {
      name: "ash",
      rate: 22,
      spread: [15, 13],
      height: [3.4, 7.6],
      velocity: [
        [-0.47, 0.03],
        [-0.95, -0.5],
        [-0.25, 0.25],
      ],
      life: [5.5, 5.5],
      size: [0.08, 0.13],
      colors: [0x8a7f74],
      drag: 0,
    },
    {
      name: "embers",
      rate: 11,
      spread: [15, 12],
      height: [0.15, 0.15],
      velocity: [
        [-0.35, 0.35],
        [1.1, 2.4],
        [-0.35, 0.35],
      ],
      life: [1.5, 1.5],
      size: [0.07, 0.11],
      colors: [0xffa040, "accent"],
      drag: 0.3,
    },
  ],
};

export const propAtmosphereRates = { spark: 5, steam: 3, glint: 1.5, spore: 2.5, mote: 3 };

// Atmosphere yields first in a crowded fight. Combat can still use the full particle pool.
export const AMBIENT_POOL_SHARE = 0.3;
export function atmosphereDensity(maxParticles, activeParticles, menu = false) {
  const quality = Math.min(1, maxParticles / 1400);
  const pressure = Math.max(0, 1 - activeParticles / Math.max(1, maxParticles * 0.6));
  return quality * pressure * (menu ? 0.6 : 1);
}
