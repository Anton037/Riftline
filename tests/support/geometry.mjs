import { Box3, Mat4, Vec3 } from "../../src/engine/math.js";

const REED_WIND = 0.14;

// Clip whole triangle faces, including faces whose vertices all lie beyond the arena.
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
  ) {
    return [];
  }
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
  const o = poly[0];
  for (let i = 1; i + 1 < poly.length; i++) {
    const ax = poly[i][0] - o[0],
      ay = poly[i][1] - o[1],
      az = poly[i][2] - o[2];
    const bx = poly[i + 1][0] - o[0],
      by = poly[i + 1][1] - o[1],
      bz = poly[i + 1][2] - o[2];
    const cx = ay * bz - az * by,
      cy = az * bx - ax * bz,
      cz = ax * by - ay * bx;
    if (cx * cx + cy * cy + cz * cz > 1e-12) return poly;
  }
  return [];
}

const contains = (ob, p, skin = 0.12) =>
  ob.t === "c"
    ? Math.hypot(p[0] - ob.x, p[2] - ob.y) <= ob.r + skin
    : Math.abs(p[0] - ob.x) <= ob.w + skin && Math.abs(p[2] - ob.y) <= ob.h + skin;

export function auditArenaGeometry(view, layout, { animatedOnly = false } = {}) {
  view.group.updateWorldMatrix(true);
  const issues = [];
  const checked = new Set();
  const animated = new Set((view.rlAnim || []).map((anim) => anim.o));
  let triangles = 0;
  let meshes = 0;
  const point = new Vec3();
  const instMat = new Mat4();
  const worldMat = new Mat4();
  const bounds = new Box3();

  view.group.traverse((mesh) => {
    if (!mesh.geometry) return;
    if (animatedOnly) {
      let ancestor = mesh;
      while (ancestor && !animated.has(ancestor)) ancestor = ancestor.parent;
      if (!ancestor) return;
    }
    meshes++;
    const geometry = mesh.geometry;
    const pos = geometry.positions;
    const idx = geometry.indices;
    const vCount = geometry.vertexCount;
    if (!checked.has(geometry)) {
      checked.add(geometry);
      if (!pos.every(Number.isFinite)) issues.push("position: non-finite geometry");
      if (!geometry.normals.every(Number.isFinite)) issues.push("normal: non-finite geometry");
      if (idx && !idx.every((i) => Number.isInteger(i) && i >= 0 && i < vCount)) issues.push("invalid triangle index");
      if ((idx ? idx.length : vCount) % 3) issues.push("incomplete triangle");
    }
    let owner = mesh;
    while (owner && owner !== view.obsGroup && owner !== view.group) owner = owner.parent;
    const obstacle = owner === view.obsGroup;
    const count = mesh.isInstancedMesh ? mesh.count : 1;
    for (let n = 0; n < count; n++) {
      if (mesh.isInstancedMesh) {
        instMat.fromArray(mesh.instanceMatrix, n * 16);
        worldMat.multiplyMatrices(mesh.worldMatrix, instMat);
      } else {
        worldMat.copy(mesh.worldMatrix);
      }
      if (!worldMat.elements.every(Number.isFinite)) {
        issues.push("non-finite world transform");
        continue;
      }
      if (mesh.material === view.floorMat || mesh.material?.shader === "aurora") continue;

      const hasWind = !!mesh.material?.reedWind;
      if (!obstacle) {
        bounds.makeEmpty();
        const b = geometry.computeBounds();
        const sway = hasWind ? Math.max(Math.abs(b.min.y), Math.abs(b.max.y)) * REED_WIND : 0;
        for (const x of [b.min.x - sway, b.max.x + sway]) {
          for (const y of [b.min.y, b.max.y]) {
            for (const z of [b.min.z - sway, b.max.z + sway]) {
              point.set(x, y, z).applyMatrix4(worldMat);
              bounds.expandByPoint(point);
            }
          }
        }
        if (
          bounds.max.y <= 0.8 ||
          bounds.max.x <= -layout.W + 0.001 ||
          bounds.min.x >= layout.W - 0.001 ||
          bounds.max.z <= -layout.H + 0.001 ||
          bounds.min.z >= layout.H - 0.001
        ) {
          triangles += ((idx ? idx.length : vCount) / 3) * (hasWind ? 4 : 1);
          continue;
        }
      }

      const winds = hasWind
        ? [
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
          ]
        : [[0, 0]];
      for (const [wx, wz] of winds) {
        const vertices = new Array(vCount);
        for (let i = 0; i < vCount; i++) {
          const px = pos[i * 3] + wx * REED_WIND * pos[i * 3 + 1];
          const py = pos[i * 3 + 1];
          const pz = pos[i * 3 + 2] + wz * REED_WIND * pos[i * 3 + 1];
          point.set(px, py, pz).applyMatrix4(worldMat);
          vertices[i] = [point.x, point.y, point.z];
        }
        const iCount = idx ? idx.length : vCount;
        for (let i = 0; i < iCount; i += 3) {
          triangles++;
          const a = vertices[idx ? idx[i] : i];
          const b = vertices[idx ? idx[i + 1] : i + 1];
          const c = vertices[idx ? idx[i + 2] : i + 2];
          if (Math.max(a[1], b[1], c[1]) <= (obstacle ? 0.25 : 0.8)) continue;
          const tri = [a, b, c];
          if (obstacle) {
            const poly = clip(tri, 1, 0.25, 1);
            if (poly.length >= 3 && !layout.obstacles.some((ob) => poly.every((v) => contains(ob, v)))) {
              if (issues.length < 10) issues.push(`solid obstacle face outside collision: ${JSON.stringify(poly[0])}`);
            }
          } else if (clipToArena(tri, layout.W, layout.H).length) {
            if (issues.length < 10) issues.push(`scenery face crosses walkable space: ${JSON.stringify(tri)}`);
          }
        }
      }
    }
  });
  return { issues, meshes, triangles };
}

export function disposeArena(view) {
  view.group.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry) o.geometry.dispose();
  });
  view.groundOcclusion?.dispose();
}
