// Ambient emission budgets are separate from simulation and from combat particle limits.
export const AMBIENT_POOL_SHARE = 0.3;
export function atmosphereDensity(maxParticles, activeParticles, menu = false) {
  const quality = Math.min(1, maxParticles / 1400);
  const pressure = Math.max(0, 1 - activeParticles / Math.max(1, maxParticles * 0.6));
  return quality * pressure * (menu ? 0.6 : 1);
}

const glaze = (rate, color, life, height, velocity, size, spark = true) => ({
  rate,
  color,
  life,
  height,
  velocity,
  size,
  spark,
});

export const biomeAtmosphere = {
  city: [
    glaze(10, 0xd6ab7f, [1.5, 2.8], [1.1, 5.2], [0.23, -0.61, 0.56], [0.065, 0.13]),
    glaze(2.2, 0x608783, [1.9, 3.1], [0.14, 0.35], [0.64, 0.17, 0.16], [0.36, 0.72], false),
  ],
  shelf: [
    glaze(22, 0xc1e6e0, [2.4, 3.5], [2.5, 7], [1.17, -0.85, 0.46], [0.067, 0.13]),
    glaze(4, 0xb9b5d3, [1.2, 2.8], [0.27, 2.1], [-0.57, 0.37, 0.56], [0.12, 0.23], false),
  ],
  marsh: [
    glaze(9, 0xcad480, [1.6, 2.9], [0.18, 2.1], [0.41, 0.6, 0.28], [0.08, 0.16]),
    glaze(3.2, 0x6c9480, [2.2, 3.4], [0.19, 0.6], [-0.31, 0.24, -0.16], [0.29, 0.74], false),
  ],
  core: [
    glaze(12, 0xd0b4e8, [1.6, 2.8], [0.1, 2], [-0.18, 1.16, 0.51], [0.06, 0.14]),
    glaze(5.3, 0x9488bf, [1.4, 3], [2, 5.2], [0.64, 0.28, -0.19], [0.11, 0.21]),
  ],
  caldera: [
    glaze(13, 0xe3aa79, [1.7, 3.1], [0.3, 2.2], [0.57, 1.12, 0.22], [0.055, 0.12]),
    glaze(4, 0x987e70, [2.3, 3.1], [2.2, 4.2], [0.91, -0.39, -0.31], [0.19, 0.39], false),
  ],
  flats: [
    glaze(11, 0xf0d8a0, [1.1, 2.5], [0.4, 2.1], [1.45, 0.2, 0.51], [0.066, 0.12]),
    glaze(4, 0xb8986e, [1.8, 2.5], [0.05, 0.55], [1.45, 0.13, 0.22], [0.32, 0.59], false),
  ],
};
