import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";

// Closed, planar chamfers: 44 triangles instead of subdivided rounded boxes.
// All vertices stay within the original box, keeping silhouettes aligned with existing hitboxes.
export function armorBox(width, height, depth, bevel = Math.min(width, height, depth) * 0.14) {
  const half = [width / 2, height / 2, depth / 2];
  const inner = half.map((h) => h - Math.min(bevel, Math.min(...half) * 0.8));
  const positions = [];
  const polygon = (points, normal) => {
    const a = new Vector3().fromArray(points[0]),
      b = new Vector3().fromArray(points[1]),
      c = new Vector3().fromArray(points[2]);
    if (
      b
        .sub(a)
        .cross(c.sub(a))
        .dot(new Vector3(...normal)) < 0
    )
      points.reverse();
    for (let i = 1; i < points.length - 1; i++) positions.push(...points[0], ...points[i], ...points[i + 1]);
  };
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3,
      v = (axis + 2) % 3;
    for (const sign of [-1, 1]) {
      const normal = [0, 0, 0];
      normal[axis] = sign;
      polygon(
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([su, sv]) => {
          const p = [0, 0, 0];
          p[axis] = half[axis] * sign;
          p[u] = inner[u] * su;
          p[v] = inner[v] * sv;
          return p;
        }),
        normal,
      );
    }
    for (const su of [-1, 1])
      for (const sv of [-1, 1]) {
        const normal = [0, 0, 0];
        normal[u] = su;
        normal[v] = sv;
        polygon(
          [
            [-1, 0],
            [1, 0],
            [1, 1],
            [-1, 1],
          ].map(([end, side]) => {
            const p = [0, 0, 0];
            p[axis] = inner[axis] * end;
            p[u] = (side ? inner[u] : half[u]) * su;
            p[v] = (side ? half[v] : inner[v]) * sv;
            return p;
          }),
          normal,
        );
      }
  }
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const sign = [x, y, z];
        polygon(
          [0, 1, 2].map((axis) => sign.map((s, i) => s * (axis === i ? half[i] : inner[i]))),
          sign,
        );
      }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
  const uv = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i] / width + 0.5, positions[i + 2] / depth + 0.5);
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
