import { Matrix4, Vector3 } from "three";
import { REED_WIND } from "../../src/render/map-geometry.js";

// Clip whole triangle faces, including faces whose vertices all lie beyond the arena.
// A vertex-only test cannot detect a large volcanic flank crossing a walkable edge.
function clip(poly, axis, limit, sign) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const da = (a[axis] - limit) * sign,
      db = (b[axis] - limit) * sign;
    if (da >= 0) out.push(a);
    if (da < 0 !== db < 0) {
      const t = da / (da - db);
      out.push(a.map((v, j) => v + (b[j] - v) * t));
    }
  }
  return out;
}
export function clipToArena(triangle, W, H, height = 0.8, borderLip = 0.001) {
  const [a0, b0, c0] = triangle;
  if (
    Math.max(a0[1], b0[1], c0[1]) <= height ||
    Math.max(a0[0], b0[0], c0[0]) <= -W + borderLip ||
    Math.min(a0[0], b0[0], c0[0]) >= W - borderLip ||
    Math.max(a0[2], b0[2], c0[2]) <= -H + borderLip ||
    Math.min(a0[2], b0[2], c0[2]) >= H - borderLip
  )
    return [];
  let poly = clip(triangle, 1, height, 1);
  for (const [axis, limit, sign] of [
    [0, -W + borderLip, 1],
    [0, W - borderLip, -1],
    [2, -H + borderLip, 1],
    [2, H - borderLip, -1],
  ]) {
    poly = clip(poly, axis, limit, sign);
    if (poly.length < 3) return [];
  }
  // Ignore exact contact with a clipping plane; it has no area in the walkable volume.
  const origin = new Vector3().fromArray(poly[0]),
    a = new Vector3(),
    b = new Vector3();
  for (let i = 1; i + 1 < poly.length; i++) {
    a.fromArray(poly[i]).sub(origin);
    b.fromArray(poly[i + 1]).sub(origin);
    if (a.cross(b).lengthSq() > 1e-12) return poly;
  }
  return [];
}
const contains = (ob, p, skin = 0.1) =>
  ob.t === "c"
    ? Math.hypot(p[0] - ob.x, p[2] - ob.y) <= ob.r + skin
    : Math.abs(p[0] - ob.x) <= ob.w + skin && Math.abs(p[2] - ob.y) <= ob.h + skin;

// Inspect the real ArenaView tree after batching, with every parent and instance transform.
// Ground dressing below 0.8 m is passable. Allow only a 1 mm numerical tolerance at the arena
// boundary. Solid obstacle faces above their flat foot trim get 0.1 m of skin.
export function auditArenaGeometry(view, layout, { animatedOnly = false } = {}) {
  view.group.updateMatrixWorld(true);
  const issues = [],
    checked = new Set();
  const animated = new Set(view.rlAnim.map((anim) => anim.o));
  let triangles = 0,
    meshes = 0;
  const point = new Vector3(),
    instance = new Matrix4();
  view.group.traverse((mesh) => {
    if (!mesh.geometry) return;
    if (animatedOnly) {
      let ancestor = mesh;
      while (ancestor && !animated.has(ancestor)) ancestor = ancestor.parent;
      if (!ancestor) return;
    }
    meshes++;
    const geometry = mesh.geometry,
      p = geometry.attributes.position,
      idx = geometry.index;
    if (!checked.has(geometry)) {
      checked.add(geometry);
      for (const [name, attribute] of Object.entries(geometry.attributes))
        if (!attribute.array.every(Number.isFinite)) issues.push(`${name}: non-finite geometry`);
      if (idx && !idx.array.every((i) => Number.isInteger(i) && i >= 0 && i < p.count))
        issues.push("invalid triangle index");
      if ((idx?.count ?? p.count) % 3) issues.push("incomplete triangle");
    }
    let owner = mesh;
    while (owner && owner !== view.obsGroup && owner !== view.group) owner = owner.parent;
    const obstacle = owner === view.obsGroup;
    for (let n = 0; n < (mesh.isInstancedMesh ? mesh.count : 1); n++) {
      const matrix = mesh.matrixWorld.clone();
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(n, instance);
        matrix.multiply(instance);
      }
      if (!matrix.elements.every(Number.isFinite)) {
        issues.push("non-finite world transform");
        continue;
      }
      // Floors and additive aurora/fog sheets are passable effects, not physical scenery.
      if (mesh.material === view.floorMat || mesh.material.isShaderMaterial) continue;
      // Reed bending happens in the GPU vertex shader. Check all four displacement extrema
      // before the instance/world transforms as well as all CPU animation poses.
      const winds = geometry.hasAttribute("aPhase")
        ? [
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
          ]
        : [[0, 0]];
      for (const [wx, wz] of winds) {
        const vertices = Array.from({ length: p.count }, (_, i) => {
          point.fromBufferAttribute(p, i);
          point.x += wx * REED_WIND * point.y;
          point.z += wz * REED_WIND * point.y;
          return point.applyMatrix4(matrix).toArray();
        });
        for (let i = 0; i < (idx?.count ?? p.count); i += 3) {
          triangles++;
          const a = vertices[idx ? idx.getX(i) : i],
            b = vertices[idx ? idx.getX(i + 1) : i + 1],
            c = vertices[idx ? idx.getX(i + 2) : i + 2];
          if (Math.max(a[1], b[1], c[1]) <= (obstacle ? 0.25 : 0.8)) continue;
          const tri = [a, b, c];
          if (obstacle) {
            if (Math.max(...tri.map((v) => v[1])) <= 0.25) continue;
            const poly = clip(tri, 1, 0.25, 1);
            if (poly.length >= 3 && !layout.obstacles.some((ob) => poly.every((v) => contains(ob, v))))
              if (issues.length < 10) issues.push(`solid obstacle face outside collision: ${JSON.stringify(poly[0])}`);
          } else if (Math.max(...tri.map((v) => v[1])) > 0.8 && clipToArena(tri, layout.W, layout.H).length) {
            if (issues.length < 10) issues.push(`scenery face crosses walkable space: ${JSON.stringify(tri)}`);
          }
        }
      }
    }
  });
  return { issues, meshes, triangles };
}
export function disposeArena(view) {
  const geometries = new Set(),
    materials = new Set();
  view.group.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  for (const geometry of geometries) geometry.dispose();
  materials.add(view.floorMat);
  for (const material of materials) material.dispose();
}
