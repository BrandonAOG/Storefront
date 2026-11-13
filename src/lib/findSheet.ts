import { orderCorners, type Pt } from "./homography";
import { SHEET, SHEETS, markerIds } from "./sheets";

export type FoundSheet = {
  /** Which sheet (1 to 3). */
  n: number;
  name: string;
  /** Four corners of the reference, ordered the way the measuring tool expects (as they appear in the photo). */
  pts: Pt[];
  widthIn: number;
  heightIn: number;
  /** False when only one corner marker was readable, which is a much smaller and less accurate reference. */
  full: boolean;
};

const area = (p: Pt[]) => Math.abs(p.reduce((s, a, i) => s + a.x * p[(i + 1) % 4].y - p[(i + 1) % 4].x * a.y, 0)) / 2;

/**
 * The tool wants corners in photo order (top-left first). The sheet may be
 * taped sideways or upside down, so work out which printed edge ended up
 * between corner 1 and corner 2 and hand back the matching width and height.
 */
function oriented(sheetPts: Pt[], widthIn: number, heightIn: number) {
  const pts = orderCorners(sheetPts);
  const turned = sheetPts.indexOf(pts[0]) % 2 === 1;
  return { pts, widthIn: turned ? heightIn : widthIn, heightIn: turned ? widthIn : heightIn };
}

/**
 * Looks for an AOG measuring sheet in a photo. Runs in the browser on the
 * picture already on screen; nothing is uploaded anywhere.
 * Returns null when no sheet is visible, or when the picture can't be read.
 */
export async function findSheet(url: string): Promise<FoundSheet | null> {
  const img = new Image();
  img.crossOrigin = "anonymous"; // stored photos live on another address; this lets the page read their pixels
  img.src = url;
  try {
    await img.decode();
  } catch {
    return null;
  }
  if (!img.naturalWidth) return null;
  const { AR } = await import("@/lib/vendor/aruco");
  const detector = new AR.Detector({ dictionaryName: SHEET.dictionary });

  // Try at two sizes: detail helps a small, far-away sheet; a smaller copy is steadier on a noisy close-up.
  let best: FoundSheet | null = null;
  for (const maxSide of [2200, 1100]) {
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let data: ImageData;
    try {
      data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      return null; // the browser won't let the page read this picture
    }
    const byId = new Map<number, Pt[]>();
    for (const m of detector.detect(data)) {
      // Keep the cleanest reading of each marker, back in full-size photo coordinates.
      if (m.hammingDistance <= 4 && !byId.has(m.id)) byId.set(m.id, m.corners.map((c) => ({ x: c.x / k, y: c.y / k })));
    }
    for (const s of SHEETS) {
      const got = markerIds(s.n).map((id) => byId.get(id));
      if (got.every(Boolean)) {
        // Outside corners: top-left of the top-left marker, top-right of the top-right one, and so on.
        const o = oriented([got[0]![0], got[1]![1], got[2]![2], got[3]![3]], SHEET.widthIn, SHEET.heightIn);
        if (!best || !best.full || area(o.pts) > area(best.pts)) best = { n: s.n, name: s.name, ...o, full: true };
      } else if (!best?.full) {
        const one = got.filter(Boolean).sort((a, b) => area(b!) - area(a!))[0];
        if (one && (!best || area(one) > area(best.pts))) best = { n: s.n, name: s.name, ...oriented(one, SHEET.markerIn, SHEET.markerIn), full: false };
      }
    }
    if (best?.full) break;
  }
  return best;
}
