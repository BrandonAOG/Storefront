import { fitHomography, orderCorners, project, type Pt } from "./homography";
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
  /**
   * How large the page was actually printed (1 = full size), worked out from
   * where the paper's own edges are, since paper is always 8.5 x 11 in.
   * Null when the edges couldn't be read confidently.
   */
  printScale: number | null;
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

type Gray = { data: Uint8ClampedArray; width: number; height: number };

/** Sheet positions (inches, from the top-left outside corner of the markers) of all 16 marker corners. */
function markerCorners(): Pt[][] {
  const m = SHEET.markerIn;
  const at = [
    { x: 0, y: 0 },
    { x: SHEET.widthIn - m, y: 0 },
    { x: SHEET.widthIn - m, y: SHEET.heightIn - m },
    { x: 0, y: SHEET.heightIn - m },
  ];
  return at.map((o) => [o, { x: o.x + m, y: o.y }, { x: o.x + m, y: o.y + m }, { x: o.x, y: o.y + m }]);
}

/**
 * Printers often shrink a page to fit ("fit to page"), which would make every
 * measurement read long. The paper itself is always 8.5 x 11 inches, so find
 * its four edges in the photo and compare them with where the markers landed.
 * `toPhoto` maps sheet inches to pixels of `img`.
 */
function printScale(img: Gray, toPhoto: number[]): number | null {
  const bright = (p: Pt) => {
    const q = project(toPhoto, p);
    const x = Math.round(q.x), y = Math.round(q.y);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
    const i = (y * img.width + x) * 4;
    return (img.data[i] * 2 + img.data[i + 1] * 5 + img.data[i + 2]) / 8;
  };
  /** How far outside the marker frame the paper ends on one side, in printed inches. */
  const edge = (point: (along: number, out: number) => Pt, from: number, to: number): number | null => {
    const step = 0.03;
    const profile: number[] = [];
    for (let out = 0.35; out <= 2.3; out += step) {
      let sum = 0, n = 0;
      for (let k = 0; k <= 12; k++) {
        const v = bright(point(from + ((to - from) * k) / 12, out));
        if (v === null) return null; // the photo cuts this side off
        sum += v;
        n++;
      }
      profile.push(sum / n);
    }
    // The paper edge is the sharpest change in brightness walking outward.
    let best = 0, bestAt = -1;
    for (let i = 3; i < profile.length - 3; i++) {
      const change = Math.abs((profile[i + 1] + profile[i + 2] + profile[i + 3]) - (profile[i - 1] + profile[i - 2] + profile[i - 3])) / 3;
      if (change > best) {
        best = change;
        bestAt = i;
      }
    }
    return best >= 7 ? 0.35 + bestAt * step : null;
  };
  const W = SHEET.widthIn, H = SHEET.heightIn;
  // Sample along the middle of each side, clear of the corners where tape usually sits.
  const left = edge((a, o) => ({ x: -o, y: a }), 2.2, H - 2.2);
  const right = edge((a, o) => ({ x: W + o, y: a }), 2.2, H - 2.2);
  const top = edge((a, o) => ({ x: a, y: -o }), 1.9, W - 1.9);
  const bottom = edge((a, o) => ({ x: a, y: H + o }), 1.9, W - 1.9);
  if (left === null || right === null || top === null || bottom === null) return null;
  const byWidth = 8.5 / (W + left + right);
  const byHeight = 11 / (H + top + bottom);
  // Only trust it when both directions tell the same story and the answer is a plausible print setting.
  if (Math.abs(byWidth - byHeight) > 0.02) return null;
  const scale = (byWidth + byHeight) / 2;
  return scale > 0.8 && scale < 1.08 ? scale : null;
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
        // Fit through all 16 marker corners, then read off where the frame's outside corners fall.
        // Sixteen points average out small errors that four would pass straight into the measurements.
        const sheetPts = markerCorners().flat();
        const photoPts = got.flatMap((c) => c!);
        const toPhoto = fitHomography(sheetPts, photoPts);
        const W = SHEET.widthIn, Hh = SHEET.heightIn;
        const corners = toPhoto ? [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: Hh }, { x: 0, y: Hh }].map((p) => project(toPhoto, p)) : [got[0]![0], got[1]![1], got[2]![2], got[3]![3]];
        const o = oriented(corners, W, Hh);
        if (!best || !best.full || area(o.pts) > area(best.pts)) {
          // Same fit, in the pixels of this working copy, to look for the paper's edges.
          const toCopy = toPhoto && fitHomography(sheetPts, photoPts.map((p) => ({ x: p.x * k, y: p.y * k })));
          best = { n: s.n, name: s.name, ...o, full: true, printScale: toCopy ? printScale(data, toCopy) : null };
        }
      } else if (!best?.full) {
        const one = got.filter(Boolean).sort((a, b) => area(b!) - area(a!))[0];
        if (one && (!best || area(one) > area(best.pts))) best = { n: s.n, name: s.name, ...oriented(one, SHEET.markerIn, SHEET.markerIn), full: false, printScale: null };
      }
    }
    if (best?.full) break;
  }
  return best;
}
