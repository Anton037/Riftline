// Closed hand-shaped strata. Every point remains inside the authored width/depth/height envelope.
import { BufferGeometry, Float32BufferAttribute } from "three";

export function strataGeometry(width, height, depth, seed = 1, round = false) {
  const sides = 10,
    positions = [],
    rings = [];
  const hash = (n) => {
    const f = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return f - Math.floor(f);
  };
  for (let layer = 0; layer < 4; layer++) {
    const ring = [],
      taper = [0.94, 1, 0.92, 0.72][layer];
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const c = Math.cos(angle),
        s = Math.sin(angle),
        radius = taper * (0.87 + hash(j + layer * 17) * 0.12);
      ring.push([
        Math.sign(c) * Math.pow(Math.abs(c), round ? 1 : 0.4) * width * 0.5 * radius,
        height * (layer === 0 ? 0 : layer === 3 ? 0.91 + hash(j + 31) * 0.09 : [0.0, 0.23, 0.66][layer]),
        Math.sign(s) * Math.pow(Math.abs(s), round ? 1 : 0.4) * depth * 0.5 * radius,
      ]);
    }
    rings.push(ring);
  }
  const triangle = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let layer = 0; layer < 3; layer++)
    for (let j = 0; j < sides; j++) {
      const next = (j + 1) % sides;
      triangle(rings[layer][j], rings[layer + 1][j], rings[layer][next]);
      triangle(rings[layer][next], rings[layer + 1][j], rings[layer + 1][next]);
    }
  for (let j = 0; j < sides; j++) {
    const next = (j + 1) % sides;
    triangle([0, height * 0.9, 0], rings[3][next], rings[3][j]);
    triangle([0, 0, 0], rings[0][j], rings[0][next]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
  geometry.computeVertexNormals();
  return geometry;
}

// A continuous flared dust ribbon, rather than a stack of solid debris cubes.
export function dustRibbonGeometry(phase = 0) {
  const positions = [],
    steps = 30;
  const at = (i, side) => {
    const f = i / steps,
      angle = f * Math.PI * 4.4 + phase + side * 0.22;
    const r = 0.18 + 0.65 * f + Math.sin(f * Math.PI) * 0.12;
    return [Math.cos(angle) * r + Math.sin(f * 4 + phase) * 0.12, f * 2.7, Math.sin(angle) * r];
  };
  for (let i = 0; i < steps; i++) {
    const a = at(i, -1),
      b = at(i, 1),
      c = at(i + 1, -1),
      d = at(i + 1, 1);
    positions.push(...a, ...c, ...b, ...b, ...c, ...d);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
