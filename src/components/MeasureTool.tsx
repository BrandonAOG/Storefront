"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { findSheet, type FoundSheet } from "@/lib/findSheet";
import { homography, orderCorners, project, validQuad, type Pt } from "@/lib/homography";
import { DEFAULT_REFS, parseRefs, type RefPreset } from "@/lib/refs";
import { SHEET } from "@/lib/sheets";

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

const BUILT_IN = parseRefs(DEFAULT_REFS);

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
 *
 * Automatic: if the customer taped up one of our printed measuring sheets, the
 * tool finds it in the photo and sets the reference with no clicks.
 */
type Props = {
  mediaId: string;
  url: string;
  name: string;
  initial: MeasureMeta | null;
  save: (id: string, meta: MeasureMeta) => Promise<{ ok: boolean }>;
  /** Known-size objects from Settings. Falls back to the built-in list. */
  presets?: RefPreset[];
};

export function MeasureTool({ mediaId, url, name, initial, save, presets = BUILT_IN }: Props) {
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
  // Automatic reference from a printed measuring sheet.
  const [sheet, setSheet] = useState<FoundSheet | null>(null);
  const [looking, setLooking] = useState<"" | "looking" | "none">("");
  const [checkBar, setCheckBar] = useState("");
  // The current reference came from a roughly-sized object, so results are approximate.
  const [approx, setApprox] = useState(false);
  const hadReference = useRef(Boolean(initial?.rect || initial?.scale));
  const [busy, startTransition] = useTransition();
  const svg = useRef<SVGSVGElement>(null);
  const img = useRef<HTMLImageElement>(null);

  // A photo that finished loading before the page became interactive never
  // fires onLoad, so read its size directly once.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth > 0) setSize({ w: el.naturalWidth, h: el.naturalHeight });
  }, [url]);

  /** Look for a printed measuring sheet in the photo and, if found, use it as the reference. */
  const lookForSheet = async (replace: boolean) => {
    setLooking("looking");
    const found = await findSheet(url).catch(() => null);
    if (!found) return setLooking(replace ? "none" : "");
    setLooking("");
    setSheet(found);
    setCheckBar("");
    setApprox(!found.full);
    setCorners(found.pts);
    setRect({ pts: found.pts, widthIn: found.widthIn, heightIn: found.heightIn });
    setScale(null);
    setMode("measure");
    setState("");
  };
  // A photo with no reference yet: look for a sheet straight away, no clicks needed.
  useEffect(() => {
    if (hadReference.current) return;
    hadReference.current = true;
    const t = setTimeout(() => void lookForSheet(false), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per photo
  }, [url]);

  /** The customer's check bar didn't measure 6 inches: the page was printed smaller or larger, so scale the reference to match. */
  const applyCheckBar = () => {
    const measured = num(checkBar);
    if (!sheet || !rect || measured < SHEET.checkIn * 0.7 || measured > SHEET.checkIn * 1.3) return;
    const k = measured / SHEET.checkIn;
    setRect({ ...rect, widthIn: sheet.widthIn * k, heightIn: sheet.heightIn * k });
  };

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
    setApprox(false);
    const pts = orderCorners(corners);
    if (!validQuad(pts)) return;
    setCorners(pts);
    setRect({ pts, widthIn, heightIn });
    setScale(null);
    setSheet(null);
    setMode("measure");
  };

  /** One click: use a known-size object for the rectangle just marked. Works out which way round it is from its shape in the photo. */
  const applyPreset = (p: RefPreset) => {
    if (corners.length !== 4 || p.h === null) return;
    const pts = orderCorners(corners);
    if (!validQuad(pts)) return;
    const across = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) + Math.hypot(pts[2].x - pts[3].x, pts[2].y - pts[3].y);
    const down = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y) + Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);
    const wide = across >= down;
    const [long, short] = p.w >= p.h ? [p.w, p.h] : [p.h, p.w];
    setCorners(pts);
    setRect({ pts, widthIn: wide ? long : short, heightIn: wide ? short : long });
    setScale(null);
    setSheet(null);
    setApprox(p.approx);
    setMode("measure");
  };

  const confirmScale = () => {
    const total = num(dims.lf) * 12 + num(dims.li);
    if (!pendingScale || total <= 0) return;
    setLength(total, false);
  };

  const setLength = (inches: number, rough: boolean) => {
    if (!pendingScale) return;
    setScale({ ...pendingScale, inches });
    setRect(null);
    setCorners([]);
    setSheet(null);
    setApprox(rough);
    setPendingScale(null);
    setMode("measure");
  };

  const ordered = corners.length === 4 ? orderCorners(corners) : corners;
  const quadOk = corners.length === 4 && validQuad(ordered);
  const needRectSize = mode === "rect" && corners.length === 4 && !rect;

  /**
   * A fine crosshair with an open centre, so the exact spot stays visible
   * instead of sitting under a dot. Dark outline first, colour on top.
   */
  const cross = (x: number, y: number, color: string) => {
    const gap = stroke * 0.9;
    const arm = stroke * 4.5;
    const arms = [
      [x - arm, y, x - gap, y],
      [x + gap, y, x + arm, y],
      [x, y - arm, x, y - gap],
      [x, y + gap, x, y + arm],
    ];
    return (
      <>
        {arms.map(([x1, y1, x2, y2], i) => <line key={`o${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={stroke * 1.1} opacity={0.7} />)}
        {arms.map(([x1, y1, x2, y2], i) => <line key={`c${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={stroke * 0.45} />)}
      </>
    );
  };

  const drawn = (l: Line, color: string, label: string, key: string) => {
    const mx = (l.ax + l.bx) / 2;
    const my = (l.ay + l.by) / 2;
    const small = font * 0.8;
    const tw = label.length * small * 0.6 + small * 0.8;
    // The label sits beside the line (on its upper side), never on top of what is being measured.
    const len = Math.hypot(l.bx - l.ax, l.by - l.ay) || 1;
    let nx = -(l.by - l.ay) / len;
    let ny = (l.bx - l.ax) / len;
    if (ny > 0 || (ny === 0 && nx > 0)) {
      nx = -nx;
      ny = -ny;
    }
    const off = stroke * 4 + small * 0.85 + (Math.abs(nx) * tw) / 2;
    const lx = Math.min(size.w - tw / 2, Math.max(tw / 2, mx + nx * off));
    const ly = Math.min(size.h - small, Math.max(small, my + ny * off));
    return (
      <g key={key}>
        <line x1={l.ax} y1={l.ay} x2={l.bx} y2={l.by} stroke="#000" strokeWidth={stroke * 1.1} opacity={0.6} />
        <line x1={l.ax} y1={l.ay} x2={l.bx} y2={l.by} stroke={color} strokeWidth={stroke * 0.45} />
        {/* End marks like a tape measure or a drawing dimension: a short bar square to the line, so the exact end stays visible. */}
        {[[l.ax, l.ay], [l.bx, l.by]].map(([x, y], i) => {
          const tick = stroke * 4;
          const px = (-(l.by - l.ay) / len) * tick;
          const py = ((l.bx - l.ax) / len) * tick;
          return (
            <g key={i}>
              <line x1={x - px} y1={y - py} x2={x + px} y2={y + py} stroke="#000" strokeWidth={stroke * 1.1} opacity={0.6} />
              <line x1={x - px} y1={y - py} x2={x + px} y2={y + py} stroke={color} strokeWidth={stroke * 0.45} />
            </g>
          );
        })}
        {label && (
          <>
            <rect x={lx - tw / 2} y={ly - small * 0.72} width={tw} height={small * 1.35} rx={small * 0.3} fill="#000" opacity={0.72} />
            <text x={lx} y={ly + small * 0.3} textAnchor="middle" fontSize={small} fontWeight="700" fill={color} fontFamily="system-ui, sans-serif">{label}</text>
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
        ? `Tap the four corners of a flat rectangle whose size you know, such as a sheet of paper on the wall, an outlet cover or a door. ${corners.length} of 4 placed.`
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
              <polygon points={ordered.map((p) => `${p.x},${p.y}`).join(" ")} fill={quadOk ? "rgba(56,189,248,0.12)" : "rgba(239,68,68,0.2)"} stroke={quadOk || ordered.length < 4 ? "#38bdf8" : "#ef4444"} strokeWidth={stroke * 0.45} strokeLinejoin="round" />
            )}
            {ordered.map((p, i) => (
              <g key={`c${i}`}>
                {cross(p.x, p.y, "#38bdf8")}
                {/* The corner number sits beside the crosshair, not on it. */}
                <text x={p.x + stroke * 3} y={p.y - stroke * 3} fontSize={font * 0.8} fontWeight="700" fill="#38bdf8" stroke="#000" strokeWidth={stroke * 0.5} paintOrder="stroke" fontFamily="system-ui, sans-serif">{i + 1}</text>
              </g>
            ))}
            {scale && drawn(scale, "#38bdf8", `${feetInches(scale.inches)} (reference)`, "scale")}
            {pendingScale && drawn(pendingScale, "#38bdf8", "reference", "pending")}
            {lines.map((l, i) => drawn(l, "#fed425", calibrated ? feetInches(inchesOf(l)) : "set reference", `l${i}`))}
            {draft && drawn(draft, mode === "scale" ? "#38bdf8" : "#fed425", mode === "measure" && calibrated ? feetInches(inchesOf(draft)) : "", "draft")}
          </svg>
        )}
      </div>

      {sheet && rect && (
        <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm" role="status">
          <p className="font-semibold">
            {sheet.full ? `Measuring sheet ${sheet.n} (${sheet.name}) found. Reference set automatically.` : `Only one corner of measuring sheet ${sheet.n} is readable, so this reference is small and less accurate. Retake the snapshot with the whole sheet in view if you can.`}
          </p>
          <p className="mt-1 text-slate-700">Just drag lines to measure. Accurate for the flat surface the sheet is taped to.</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label>
              <span className="label">Customer&apos;s check bar measured (in)</span>
              <input className="input w-24" inputMode="decimal" placeholder={String(SHEET.checkIn)} value={checkBar} onChange={(e) => setCheckBar(e.target.value)} />
            </label>
            <button type="button" className="btn btn-ghost" disabled={!checkBar} onClick={applyCheckBar}>Adjust</button>
            <span className="basis-full text-xs text-slate-600">Only needed if the bar printed on the sheet isn&apos;t {SHEET.checkIn} inches, which means their printer shrank the page.</span>
          </div>
        </div>
      )}
      {looking === "none" && !sheet && <p className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm" role="status">No measuring sheet found in this picture. Mark a known object by hand with Rectangle reference.</p>}

      {needRectSize && (
        <div className="mt-3 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm">
          {quadOk ? (
            <>
              <p className="font-semibold">What did you mark? Pick it, or type its size.</p>
              <p className="text-slate-600">Picking a known object sets the size in one click, whichever way round it is.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {presets.filter((p) => p.h !== null).map((p) => (
                  <button key={p.label} type="button" className="rounded-full border border-sky-400 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-sky-100" onClick={() => applyPreset(p)}>
                    {p.label} <span className="font-normal text-slate-500">{p.approx ? "about " : ""}{p.w} × {p.h} in</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-600">Or type it. Width is the edge from corner 1 to corner 2; height is from corner 1 to corner 4.</p>
              <div className="mt-1 flex flex-wrap items-end gap-2">
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
          <div className="flex w-full flex-wrap gap-2">
            {presets.map((p) =>
              (p.h === null ? [{ label: p.label, len: p.w }] : [{ label: `${p.label}, long side`, len: Math.max(p.w, p.h) }, { label: `${p.label}, short side`, len: Math.min(p.w, p.h) }]).map((o) => (
                <button key={o.label} type="button" className="rounded-full border border-sky-400 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-sky-100" onClick={() => setLength(o.len, p.approx)}>
                  {o.label} <span className="font-normal text-slate-500">{p.approx ? "about " : ""}{o.len} in</span>
                </button>
              )),
            )}
          </div>
          {field("lf", "Feet")}{field("li", "Inches")}
          <button type="button" className="btn btn-dark" onClick={confirmScale}>Set length</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPendingScale(null)}>Cancel</button>
        </div>
      )}

      {help && !needRectSize && !pendingScale && <p className="mt-3 text-sm text-slate-600">{help}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost" disabled={looking === "looking" || !size.w} onClick={() => void lookForSheet(true)}>{looking === "looking" ? "Looking…" : "Find measuring sheet"}</button>
        <button type="button" className={`btn ${mode === "rect" ? "btn-dark" : "btn-ghost"}`} onClick={() => setMode("rect")}>Rectangle reference</button>
        <button type="button" className={`btn ${mode === "scale" ? "btn-dark" : "btn-ghost"}`} onClick={() => setMode("scale")}>Line reference</button>
        <button type="button" className={`btn ${mode === "measure" ? "btn-dark" : "btn-ghost"}`} disabled={!calibrated} onClick={() => setMode("measure")}>Measure</button>
        <button type="button" className="btn btn-ghost" disabled={!lines.length} onClick={() => { setLines(lines.slice(0, -1)); setState(""); }}>Undo</button>
        <button type="button" className="btn btn-ghost" disabled={!lines.length && !calibrated && !corners.length} onClick={() => { setLines([]); setScale(null); setRect(null); setCorners([]); setSheet(null); setApprox(false); setLooking(""); setMode("rect"); setState(""); }}>Clear all</button>
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
      {approx && calibrated && <p className="mt-2 text-xs font-semibold text-amber-700">Approximate: this reference is only roughly the stated size, so treat these numbers as a guide.</p>}
      <p className="mt-2 text-xs text-slate-500">
        {H
          ? "Angle-corrected using your rectangle. Accurate only for points on that same flat surface (the same wall, or the same slab), not for depth. Confirm on site before ordering or pouring a pad."
          : "Estimates only. A line reference is accurate only for things at the same distance and angle. For a tilted photo, use a rectangle reference. Confirm on site."}
      </p>
    </div>
  );
}
