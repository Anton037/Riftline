// A segment's direction already contains its rotation and length; avoid an angle/trig round trip.
export function writeSegmentMatrix(m, off, x0, z0, x1, z1, y, width, height) {
  const dx = x1 - x0,
    dz = z1 - z0,
    length = Math.hypot(dx, dz);
  if (length < 1e-4) return false;
  const perpendicular = width / length;
  m[off] = dx;
  m[off + 1] = 0;
  m[off + 2] = dz;
  m[off + 3] = 0;
  m[off + 4] = 0;
  m[off + 5] = height;
  m[off + 6] = 0;
  m[off + 7] = 0;
  m[off + 8] = -dz * perpendicular;
  m[off + 9] = 0;
  m[off + 10] = dx * perpendicular;
  m[off + 11] = 0;
  m[off + 12] = x0;
  m[off + 13] = y;
  m[off + 14] = z0;
  m[off + 15] = 1;
  return true;
}
