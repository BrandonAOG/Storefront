"use client";

import { useRef, useState, useTransition } from "react";

type Line = { ax: number; ay: number; bx: number; by: number };
export type MeasureMeta = { w: number; h: number; scale: (Line & { inches: number }) | null; lines: Line[] };

const dist = (l: Line) => Math.hypot(l.bx - l.ax, l.by - l.ay);

/** 63 -> 5' 3" */
export function feetInches(inches: number): string {
  const total = Math.round(inches);
  const ft = Math.floor(total / 12);
  const rest = total % 12;
  return ft > 0 ? `${ft}' ${rest}"` : `${rest}"`;
}

/**
 * Measure things in a photo. First draw a line over something whose real size
 * you know and enter that size; every line after that is converted to feet and
 * inches. Estimates only: accurate for things at about the same distance and
 * angle as the reference.
 */
export function MeasureTool({ mediaId, url, name, initial, save }: { mediaId: string; url: string; name: string; initial: MeasureMeta | null; save: (id: string, meta: MeasureMeta) => Promise<{ ok: boolean }> }) {
  const [size, setSize] = useState({ w: initial?.w ?? 0, h: initial?.h ?? 0 });
  const [scale, setScale] = useState(initial?.scale ?? null);
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? []);
  const [mode, setMode] = useState<"scale" | "measure">(initial?.scale ? "measure" : "scale");
  const [draft, setDraft] = useState<Line | null>(null);
  const [pendingScale, setPendingScale] = useState<Line | null>(null);
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [state, setState] = useState<"" | "saved" | "failed">("");
  const [busy, startTransition] = useTransition();
  const svg = useRef<SVGSVGElement>(null);

  const point = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h };
  };
  const down = (e: React.PointerEvent) => {
    if (!size.w) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = point(e);
    setDraft({ ax: p.x, ay: p.y, bx: p.x, by: p.y });
  };
  const move = (e: React.PointerEvent) => {
    if (!draft) return;
    const p = point(e);
    setDraft({ ...draft, bx: p.x, by: p.y });
  };
  const up = () => {
    if (!draft) return;
    // Ignore accidental taps.
    if (dist(draft) > size.w * 0.015) {
      if (mode === "scale") setPendingScale(draft);
      else setLines([...lines, draft]);
      setState("");
    }
    setDraft(null);
  };

  const confirmScale = () => {
    const total = (Number.parseFloat(feet) || 0) * 12 + (Number.parseFloat(inches) || 0);
    if (!pendingScale || total <= 0) return;
    setScale({ ...pendingScale, inches: total });
    setPendingScale(null);
    setMode("measure");
    setState("");
  };

  const perPixel = scale ? scale.inches / dist(scale) : 0;
  const stroke = Math.max(2, size.w / 320);
  const font = Math.max(14, size.w / 42);

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

  return (
    <div>
      <div className="relative select-none overflow-hidden rounded-xl bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- stored photo shown at its own address */}
        <img src={url} alt={name} draggable={false} className="block w-full" onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
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
            onPointerCancel={() => setDraft(null)}
          >
            {scale && drawn(scale, "#38bdf8", `${feetInches(scale.inches)} (reference)`, "scale")}
            {pendingScale && drawn(pendingScale, "#38bdf8", "reference", "pending")}
            {lines.map((l, i) => drawn(l, "#fed425", perPixel ? feetInches(dist(l) * perPixel) : "set scale", `l${i}`))}
            {draft && drawn(draft, mode === "scale" ? "#38bdf8" : "#fed425", mode === "measure" && perPixel ? feetInches(dist(draft) * perPixel) : "", "draft")}
          </svg>
        )}
      </div>

      {pendingScale ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm">
          <p className="w-full font-semibold">How long is the thing you just marked?</p>
          <label><span className="label">Feet</span><input className="input w-24" inputMode="decimal" value={feet} onChange={(e) => setFeet(e.target.value)} /></label>
          <label><span className="label">Inches</span><input className="input w-24" inputMode="decimal" value={inches} onChange={(e) => setInches(e.target.value)} /></label>
          <button type="button" className="btn btn-dark" onClick={confirmScale}>Set scale</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPendingScale(null)}>Cancel</button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          {mode === "scale"
            ? "Step 1: drag a line across something whose real size you know, such as a door (usually 6' 8\" tall), a tape measure or the panel cover."
            : "Step 2: drag a line between any two points to measure it."}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={`btn ${mode === "scale" ? "btn-dark" : "btn-ghost"}`} onClick={() => setMode("scale")}>{scale ? "Change scale" : "Set scale"}</button>
        <button type="button" className={`btn ${mode === "measure" ? "btn-dark" : "btn-ghost"}`} disabled={!scale} onClick={() => setMode("measure")}>Measure</button>
        <button type="button" className="btn btn-ghost" disabled={!lines.length} onClick={() => { setLines(lines.slice(0, -1)); setState(""); }}>Undo</button>
        <button type="button" className="btn btn-ghost" disabled={!lines.length && !scale} onClick={() => { setLines([]); setScale(null); setMode("scale"); setState(""); }}>Clear all</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !size.w}
          onClick={() => startTransition(async () => setState((await save(mediaId, { w: size.w, h: size.h, scale, lines })).ok ? "saved" : "failed"))}
        >
          {busy ? "Saving…" : "Save measurements"}
        </button>
        {state && <span role="status" className={`self-center text-sm font-semibold ${state === "saved" ? "text-green-700" : "text-red-700"}`}>{state === "saved" ? "Saved" : "Couldn't save"}</span>}
      </div>

      {perPixel > 0 && lines.length > 0 && (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          {lines.map((l, i) => <li key={i}><strong>{feetInches(dist(l) * perPixel)}</strong></li>)}
        </ol>
      )}
      <p className="mt-2 text-xs text-slate-500">Estimates only, most accurate for things at the same distance and angle as your reference. Confirm on site before ordering or pouring a pad.</p>
    </div>
  );
}
