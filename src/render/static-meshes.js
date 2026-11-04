// Bake static opaque siblings per material while preserving animated parents and translucent sorting.
import { Mesh } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function mergeStaticMeshes(root, moving = new Set()) {
  for (const child of [...root.children]) {
    if (child.isGroup) mergeStaticMeshes(child, moving);
  }
  const buckets = new Map();
  for (const child of root.children) {
    const mat = child.material;
    if (
      !child.isMesh ||
      child.isInstancedMesh ||
      moving.has(child) ||
      child.children.length ||
      !child.visible ||
      !mat ||
      Array.isArray(mat) ||
      mat.transparent ||
      mat.isShaderMaterial ||
      mat.map ||
      mat.alphaMap ||
      child.geometry.morphAttributes.position
    )
      continue;
    const signature = Object.entries(child.geometry.attributes)
      .filter(([name]) => name !== "uv" && name !== "uv1")
      .map(([name, attr]) => `${name}:${attr.itemSize}:${attr.normalized}:${attr.array.constructor.name}`)
      .sort()
      .join("|");
    const key = `${mat.uuid}:${!!child.geometry.index}:${signature}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = { mat, meshes: [] }));
    bucket.meshes.push(child);
  }
  for (const { mat, meshes } of buckets.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      mesh.updateMatrix();
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrix);
      // No texture uses UVs here; primitives do not all carry the same UV attributes.
      geo.deleteAttribute("uv");
      geo.deleteAttribute("uv1");
      return geo;
    });
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    const merged = new Mesh(geometry, mat);
    merged.name = "static-batch";
    merged.matrixAutoUpdate = false;
    root.add(merged);
    const disposed = new Set();
    for (const mesh of meshes) {
      root.remove(mesh);
      if (!disposed.has(mesh.geometry)) {
        mesh.geometry.dispose();
        disposed.add(mesh.geometry);
      }
    }
  }
}
