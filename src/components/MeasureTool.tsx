"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { homography, orderCorners, project, validQuad, type Pt } from "@/lib/homography";

type Line = { ax: number; ay: number; bx: number; by: number };
type Rect = { pts: Pt[]; widthIn: number; heightIn: number };
export type MeasureMeta = { w: number; h: number; scale: (Line & { inches: number }) | null; rect?: Rect | null; lines: Line[] };
type Mode = "rect" | "scale" | "measure";

const dist = (l: Line) => Math.hypot(l.bx - l.ax, l.by - l.ay);
const num = (v: string) => Number.parseFloat(v) || 0;

/** 63 -> 5' 3" */
export function feetInches(inches: number): string {
  const total = Math.round(inches);
  const ft = Math.floor(total / 12);
  const rest = total % 12;
  return ft > 0 ? `${ft}' ${rest}"` : `${rest}"`;
}

const PRESETS: { label: string; w: number; h: number }[] = [
  { label: "Letter paper, upright (8.5 × 11 in)", w: 8.5, h: 11 },
  { label: "Letter paper, sideways (11 × 8.5 in)", w: 11, h: 8.5 },
  { label: "Standard door (36 × 80 in)", w: 36, h: 80 },
];

/**
 * Measure things in a photo.
 *
 * Best: mark the four corners of a flat rectangle whose size you know (a sheet
 * of paper on the wall, a door, the panel cover). The tool then corrects for
 * the camera angle, so anything on that same flat surface measures correctly
 * even in a tilted photo.
 *
 * Quick: mark one line of known length. Only accurate for things at the same
 * distance and angle as that line.
 */
export function MeasureTool({ mediaId, url, name, initial, save }: { mediaId: string; url: string; name: string; initial: MeasureMeta | null; save: (id: string, meta: MeasureMeta) => Promise<{ ok: boolean }> }) {
  const [size, setSize] = useState({ w: initial?.w ?? 0, h: initial?.h ?? 0 });
  const [scale, setScale] = useState(initial?.scale ?? null);
  const [rect, setRect] = useState<Rect | null>(initial?.rect ?? null);
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? []);
  const [mode, setMode] = useState<Mode>(initial?.rect || initial?.scale ? "measure" : "rect");
  // Work in progress: corners being placed, a line being dragged, a line awaiting its length.
  const [corners, setCorners] = useState<Pt[]>(initial?.rect?.pts ?? []);
  const [dragCorner, setDragCorner] = useState<number | null>(null);
  const [draft, setDraft] = useState<Line | null>(null);
  const [pendingScale, setPendingScale] = useState<Line | null>(null);
  const [dims, setDims] = useState({ wf: "", wi: "", hf: "", hi: "", lf: "", li: "" });
  const [state, setState] = useState<"" | "saved" | "failed">("");
  const [busy, startTransition] = useTransition();
  const svg = useRef<SVGSVGElement>(null);
  const img = useRef<HTMLImageElement>(null);

  // A photo that finished loading before the page became interactive never
  // fires onLoad, so read its size directly once.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth > 0) setSize({ w: el.naturalWidth, h: el.naturalHeight });
  }, [url]);

  // The active way of turning photo pixels into inches.
  const H = useMemo(() => {
    if (!rect || rect.pts.length !== 4 || !validQuad(rect.pts)) return null;
    return homography(rect.pts, [{ x: 0, y: 0 }, { x: rect.widthIn, y: 0 }, { x: rect.widthIn, y: rect.heightIn }, { x: 0, y: rect.heightIn }]);
  }, [rect]);
  const perPixel = scale ? scale.inches / dist(scale) : 0;
  const calibrated = Boolean(H) || perPixel > 0;
  const inchesOf = (l: Line): number => {
    if (H) {
      const a = project(H, { x: l.ax, y: l.ay });
      const b = project(H, { x: l.bx, y: l.by });
      return Math.hypot(b.x - a.x, b.y - a.y);
    }
    return dist(l) * perPixel;
  };

  const stroke = Math.max(2, size.w / 320);
  const font = Math.max(14, size.w / 42);
  const grab = stroke * 9; // how close a tap must be to pick up a corner

  const point = (e: React.PointerEvent): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h };
  };

  const down = (e: React.PointerEvent) => {
    if (!size.w) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = point(e);
    setState("");
    if (mode === "rect") {
      const near = corners.findIndex((c) => Math.hypot(c.x - p.x, c.y - p.y) < grab);
      if (near >= 0) setDragCorner(near);
      else if (corners.length < 4) {
        setCorners([...corners, p]);
        setDragCorner(corners.length);
        setRect(null);
      }
      return;
    }
    setDraft({ ax: p.x, ay: p.y, bx: p.x, by: p.y });
  };

  const move = (e: React.PointerEvent) => {
    const p = point(e);
    if (dragCorner !== null) {
      const next = corners.map((c, i) => (i === dragCorner ? p : c));
      setCorners(next);
      // Adjusting a corner of a confirmed rectangle updates measurements live.
      if (rect && next.length === 4) setRect({ ...rect, pts: orderCorners(next) });
    } else if (draft) setDraft({ ...draft, bx: p.x, by: p.y });
  };

  const up = () => {
    setDragCorner(null);
    if (!draft) return;
    if (dist(draft) > size.w * 0.015) {
      // Ignore accidental taps.
      if (mode === "scale") setPendingScale(draft);
      else setLines([...lines, draft]);
    }
    setDraft(null);
  };

  const confirmRect = () => {
    const widthIn = num(dims.wf) * 12 + num(dims.wi);
    const heightIn = num(dims.hf) * 12 + num(dims.hi);
    if (corners.length !== 4 || widthIn <= 0 || heightIn <= 0) return;
    const pts = orderCorners(corners);
    if (!validQuad(pts)) return;
    setCorners(pts);
    setRect({ pts, widthIn, heightIn });
    setScale(null);
    setMode("measure");
  };

  const confirmScale = () => {
    const total = num(dims.lf) * 12 + num(dims.li);
    if (!pendingScale || total <= 0) return;
    setScale({ ...pendingScale, inches: total });
    setRect(null);
    setCorners([]);
    setPendingScale(null);
    setMode("measure");
  };

  const ordered = corners.length === 4 ? orderCorners(corners) : corners;
  const quadOk = corners.length === 4 && validQuad(ordered);
  const needRectSize = mode === "rect" && corners.length === 4 && !rect;

  const drawn = (l: Line, color: string, label: string, key: string) => {
    const mx = (l.ax + l.bx) / 2;
    const my = (l.ay + l.by) / 2;
    const tw = label.length * font * 0.62 + font;
    return (
      <g key={key}>
        <line x1={l.ax} y1={l.ay} x2={l.bx} y2={l.by} stroke="#000" strokeWidth={stroke * 2.2} strokeLinecap="round" opacity={0.55} />
        <line x1={l.ax} y1={l.ay} x2={l.bx} y2={l.by} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        <circle cx={l.ax} cy={l.ay} r={stroke * 2} fill={color} stroke="#000" strokeWidth={stroke / 2} />
        <circle cx={l.bx} cy={l.by} r={stroke * 2} fill={color} stroke="#000" strokeWidth={stroke / 2} />
        {label && (
          <>
            <rect x={mx - tw / 2} y={my - font * 0.8} width={tw} height={font * 1.5} rx={font * 0.3} fill="#000" opacity={0.8} />
            <text x={mx} y={my + font * 0.3} textAnchor="middle" fontSize={font} fontWeight="700" fill={color} fontFamily="system-ui, sans-serif">{label}</text>
          </>
        )}
      </g>
    );
  };

  const field = (key: keyof typeof dims, label: string) => (
    <label><span className="label">{label}</span><input className="input w-20" inputMode="decimal" value={dims[key]} onChange={(e) => setDims({ ...dims, [key]: e.target.value })} /></label>
  );

  const help =
    mode === "rect"
      ? corners.length < 4
        ? `Tap the four corners of a flat rectangle whose size you know, such as a sheet of paper on the wall, a door or the panel cover. ${corners.length} of 4 placed.`
        : rect
          ? "Drag any corner to fine-tune it, or switch to Measure."
          : ""
      : mode === "scale"
        ? "Drag a line across something whose real length you know."
        : calibrated
          ? `Drag a line between any two points to measure it.${H ? " Accurate for anything on the same flat surface as your rectangle." : ""}`
          : "Set a reference first.";

  return (
    <div>
      <div className="relative select-none overflow-hidden rounded-xl bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- stored photo shown at its own address */}
        <img ref={img} src={url} alt={name} draggable={false} className="block w-full" onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        {size.w > 0 && (
          <svg
            ref={svg}
            viewBox={`0 0 ${size.w} ${size.h}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
            role="img"
            aria-label="Draw on the photo to measure"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => { setDraft(null); setDragCorner(null); }}
          >
            {ordered.length > 1 && (
              <polygon points={ordered.map((p) => `${p.x},${p.y}`).join(" ")} fill={quadOk ? "rgba(56,189,248,0.18)" : "rgba(239,68,68,0.2)"} stroke={quadOk || ordered.length < 4 ? "#38bdf8" : "#ef4444"} strokeWidth={stroke} strokeLinejoin="round" />
            )}
            {ordered.map((p, i) => (
              <g key={`c${i}`}>
                <circle cx={p.x} cy={p.y} r={stroke * 3.5} fill="#38bdf8" stroke="#000" strokeWidth={stroke / 2} />
                <text x={p.x} y={p.y + font * 0.32} textAnchor="middle" fontSize={font * 0.85} fontWeight="700" fill="#000" fontFamily="system-ui, sans-serif">{i + 1}</text>
              </g>
            ))}
            {scale && drawn(scale, "#38bdf8", `${feetInches(scale.inches)} (reference)`, "scale")}
            {pendingScale && drawn(pendingScale, "#38bdf8", "reference", "pending")}
            {lines.map((l, i) => drawn(l, "#fed425", calibrated ? feetInches(inchesOf(l)) : "set reference", `l${i}`))}
            {draft && drawn(draft, mode === "scale" ? "#38bdf8" : "#fed425", mode === "measure" && calibrated ? feetInches(inchesOf(draft)) : "", "draft")}
          </svg>
        )}
      </div>

      {needRectSize && (
        <div className="mt-3 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm">
          {quadOk ? (
            <>
              <p className="font-semibold">What size is the rectangle you marked?</p>
              <p className="text-slate-600">Width is the edge from corner 1 to corner 2. Height is the edge from corner 1 to corner 4.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p.label} type="button" className="rounded-full border border-sky-400 bg-white px-3 py-1.5 text-xs font-semibold" onClick={() => setDims({ ...dims, wf: "", wi: String(p.w), hf: "", hi: String(p.h) })}>{p.label}</button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                {field("wf", "Width ft")}{field("wi", "Width in")}{field("hf", "Height ft")}{field("hi", "Height in")}
                <button type="button" className="btn btn-dark" onClick={confirmRect}>Use this rectangle</button>
              </div>
            </>
          ) : (
            <p role="alert" className="font-semibold text-red-700">Those four points don&apos;t make a rectangle. Drag the corners onto the four corners of the object, or start again.</p>
          )}
          <button type="button" className="mt-2 text-xs underline" onClick={() => { setCorners([]); setRect(null); }}>Start the corners again</button>
        </div>
      )}

      {pendingScale && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm">
          <p className="w-full font-semibold">How long is the thing you just marked?</p>
          {field("lf", "Feet")}{field("li", "Inches")}
          <button type="button" className="btn btn-dark" onClick={confirmScale}>Set length</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPendingScale(null)}>Cancel</button>
        </div>
      )}

      {help && !needRectSize && !pendingScale && <p className="mt-3 text-sm text-slate-600">{help}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={`btn ${mode === "rect" ? "btn-dark" : "btn-ghost"}`} onClick={() => setMode("rect")}>Rectangle reference</button>
        <button type="button" className={`btn ${mode === "scale" ? "btn-dark" : "btn-ghost"}`} onClick={() => setMode("scale")}>Line reference</button>
        <button type="button" className={`btn ${mode === "measure" ? "btn-dark" : "btn-ghost"}`} disabled={!calibrated} onClick={() => setMode("measure")}>Measure</button>
        <button type="button" className="btn btn-ghost" disabled={!lines.length} onClick={() => { setLines(lines.slice(0, -1)); setState(""); }}>Undo</button>
        <button type="button" className="btn btn-ghost" disabled={!lines.length && !calibrated && !corners.length} onClick={() => { setLines([]); setScale(null); setRect(null); setCorners([]); setMode("rect"); setState(""); }}>Clear all</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !size.w}
          onClick={() => startTransition(async () => setState((await save(mediaId, { w: size.w, h: size.h, scale, rect, lines })).ok ? "saved" : "failed"))}
        >
          {busy ? "Saving…" : "Save measurements"}
        </button>
        {state && <span role="status" className={`self-center text-sm font-semibold ${state === "saved" ? "text-green-700" : "text-red-700"}`}>{state === "saved" ? "Saved" : "Couldn't save"}</span>}
      </div>

      {calibrated && lines.length > 0 && (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          {lines.map((l, i) => <li key={i}><strong>{feetInches(inchesOf(l))}</strong></li>)}
        </ol>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {H
          ? "Angle-corrected using your rectangle. Accurate only for points on that same flat surface (the same wall, or the same slab), not for depth. Confirm on site before ordering or pouring a pad."
          : "Estimates only. A line reference is accurate only for things at the same distance and angle. For a tilted photo, use a rectangle reference. Confirm on site."}
      </p>
    </div>
  );
}
