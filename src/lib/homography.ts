/** Geometry for measuring on a photo of a flat surface taken at an angle. */
export type Pt = { x: number; y: number };

/**
 * Finds the perspective transform that maps four points on the photo to four
 * points on the real surface. With it, any other point on that same flat
 * surface can be converted from photo pixels to real-world inches, which
 * undoes the distortion of a tilted camera.
 * Returns null when the four points don't form a usable shape.
 */
export function homography(src: Pt[], dst: Pt[]): number[] | null {
  // Solve the standard 8x8 system for h (h33 fixed at 1) by Gaussian elimination.
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    if (Math.abs(A[pivot][col]) < 1e-10) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c < 9; c++) A[r][c] -= f * A[col][c];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

export function project(h: number[], p: Pt): Pt {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

/**
 * Puts four corners in a fixed order no matter how they were tapped:
 * top-left, top-right, bottom-right, bottom-left (as they appear in the photo).
 */
export function orderCorners(pts: Pt[]): Pt[] {
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const around = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // Start from the corner nearest the photo's top-left.
  let start = 0;
  around.forEach((p, i) => {
    if (p.x + p.y < around[start].x + around[start].y) start = i;
  });
  return [0, 1, 2, 3].map((i) => around[(start + i) % 4]);
}

/** True when the corners form a proper four-sided shape (no three in a line, not crossed). */
export function validQuad(pts: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}
