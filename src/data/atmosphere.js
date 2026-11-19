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
    glaze(11, 0xffca7a, [1.8, 3.2], [0.5, 3.8], [0.18, 0.48, 0.22], [0.065, 0.135]),
    glaze(8, 0x9ad8ee, [0.9, 1.6], [2.4, 6.2], [0.28, -2.4, 0.35], [0.055, 0.1]),
    glaze(2.4, 0x4b7486, [2.0, 3.2], [0.14, 0.42], [0.52, 0.15, 0.18], [0.34, 0.68], false),
  ],
  shelf: [
    glaze(18, 0xf2fcff, [2.4, 3.8], [2.2, 6.8], [1.08, -0.88, 0.48], [0.075, 0.145]),
    glaze(8, 0x7cf8e2, [1.8, 3.0], [0.6, 3.4], [-0.36, 0.42, 0.38], [0.06, 0.12]),
    glaze(3.5, 0xd4f2ff, [1.6, 2.8], [0.2, 1.6], [0.72, 0.24, 0.42], [0.16, 0.32], false),
  ],
  marsh: [
    glaze(10, 0xfbe07e, [1.8, 3.3], [0.35, 2.4], [0.34, 0.46, 0.32], [0.075, 0.15]),
    glaze(8, 0x76f8b0, [1.6, 2.9], [0.2, 2.2], [-0.28, 0.68, 0.26], [0.065, 0.13]),
    glaze(3.0, 0x5ca88a, [2.3, 3.5], [0.18, 0.62], [-0.28, 0.2, -0.16], [0.3, 0.72], false),
  ],
  core: [
    glaze(11, 0xffbeea, [1.7, 3.0], [0.25, 2.8], [-0.2, 0.96, 0.42], [0.065, 0.14]),
    glaze(8, 0xc696ff, [1.6, 2.9], [0.6, 4.2], [0.46, 0.62, -0.28], [0.075, 0.15]),
    glaze(3.2, 0x8e72d8, [1.8, 3.1], [1.4, 4.6], [0.52, 0.24, -0.18], [0.16, 0.3], false),
  ],
  caldera: [
    glaze(12, 0xffbe58, [1.6, 3.0], [0.25, 2.8], [0.52, 1.35, 0.34], [0.065, 0.135]),
    glaze(8, 0xff7830, [1.4, 2.6], [0.2, 2.2], [-0.38, 1.08, 0.28], [0.055, 0.115]),
    glaze(3.5, 0x8a6b5e, [2.2, 3.2], [1.8, 4.2], [0.85, -0.36, -0.28], [0.18, 0.36], false),
  ],
  flats: [
    glaze(11, 0xffe89c, [1.3, 2.6], [0.35, 2.4], [1.35, 0.32, 0.48], [0.068, 0.13]),
    glaze(6, 0x66f0de, [1.4, 2.6], [0.25, 1.9], [0.65, 0.44, -0.32], [0.06, 0.12]),
    glaze(3.6, 0xd8b27c, [1.8, 2.7], [0.08, 0.6], [1.42, 0.15, 0.24], [0.3, 0.56], false),
  ],
};
