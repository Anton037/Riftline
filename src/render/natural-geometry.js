// Authored natural silhouettes with explicit envelopes for collision and exterior placement.
import { BufferGeometry, Float32BufferAttribute } from "three";

export function mushroomCapGeometry(radius, height, seed = 1) {
  // Tiny floor fungi occupy only a few pixels; reserve the full silhouette for larger caps.
  const small = radius < 0.25,
    sides = small ? 8 : 24,
    profile = small
      ? [
          [0.8, 0.1],
          [1, 0.2],
          [0.6, 0.8],
        ]
      : [
          [0.55, 0.07],
          [0.93, 0.13],
          [1, 0.2],
          [0.9, 0.5],
          [0.6, 0.83],
          [0.24, 0.98],
        ],
    pos = [0, 0, 0],
    indices = [];
  for (const [r, y] of profile)
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2,
        lobe = 0.92 + Math.sin(a * 3 + seed) * 0.035 + Math.sin(a * 7 - seed) * 0.025;
      pos.push(
        Math.cos(a) * radius * r * lobe,
        height * (y + Math.sin(a * 4 + seed) * 0.035 * r * (1 - y)),
        Math.sin(a) * radius * r * lobe,
      );
    }
  const top = pos.length / 3;
  pos.push(0, height, 0);
  for (let j = 0; j < sides; j++) {
    const next = (j + 1) % sides;
    indices.push(0, 1 + j, 1 + next);
    for (let row = 0; row < profile.length - 1; row++) {
      const a = 1 + row * sides + j,
        b = 1 + row * sides + next;
      indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
    const end = 1 + (profile.length - 1) * sides;
    indices.push(top, end + next, end + j);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// A coating follows the sculpted face exactly, avoiding a flat slab floating over uneven rock.
export function topCoatGeometry(source, lift = 0.025) {
  const p = source.attributes.position,
    ids = source.index?.array,
    pos = [];
  for (let i = 0; i < (ids?.length ?? p.count); i += 3) {
    const a = ids ? ids[i] : i,
      b = ids ? ids[i + 1] : i + 1,
      c = ids ? ids[i + 2] : i + 2,
      ux = p.getX(b) - p.getX(a),
      uy = p.getY(b) - p.getY(a),
      uz = p.getZ(b) - p.getZ(a),
      vx = p.getX(c) - p.getX(a),
      vy = p.getY(c) - p.getY(a),
      vz = p.getZ(c) - p.getZ(a),
      nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    if (ny <= Math.hypot(nx, ny, nz) * 0.55) continue;
    for (const j of [a, b, c]) pos.push(p.getX(j), p.getY(j) + lift, p.getZ(j));
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
