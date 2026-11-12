"use client";

import { useRef, useState } from "react";
import { MeasureTool, type MeasureMeta } from "./MeasureTool";

type Media = { id: string; url: string; name: string; contentType: string; kind: string; meta: MeasureMeta | null };
type Note = { id: string; mediaId: string | null; atSeconds: number | null; body: string };
type Props = {
  visitId: string;
  media: Media[];
  notes: Note[];
  addNote: (fd: FormData) => Promise<void>;
  deleteNote: (fd: FormData) => Promise<void>;
  saveMeasure: (id: string, meta: MeasureMeta) => Promise<{ ok: boolean }>;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Watch the customer's files and pin notes to moments in a video. */
export function VisitReview({ visitId, media, notes, addNote, deleteNote, saveMeasure }: Props) {
  const [current, setCurrent] = useState(media[0]?.id ?? "");
  const [at, setAt] = useState<number | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const active = media.find((m) => m.id === current);
  const isVideo = active?.contentType.startsWith("video/");

  const jump = (n: Note) => {
    if (n.mediaId) setCurrent(n.mediaId);
    // Wait for the player to switch files before seeking.
    setTimeout(() => {
      if (video.current && n.atSeconds !== null) {
        video.current.currentTime = n.atSeconds;
        void video.current.play().catch(() => {});
      }
    }, 150);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div>
        {!active && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No photos, video or snapshots yet.</p>}
        {active && isVideo && <video key={active.id} ref={video} src={active.url} controls playsInline className="max-h-[480px] w-full rounded-xl bg-black" />}
        {active && !isVideo && <MeasureTool key={active.id} mediaId={active.id} url={active.url} name={active.name} initial={active.meta} save={saveMeasure} />}
        {media.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {media.map((m, i) => (
              <button key={m.id} type="button" onClick={() => { setCurrent(m.id); setAt(null); }} className={`rounded-lg border px-3 py-1 text-xs font-semibold ${m.id === current ? "border-ink bg-ink text-white" : "border-slate-300 bg-white"}`}>
                {m.contentType.startsWith("video/") ? "Video" : m.kind === "snapshot" ? "Snapshot" : "Photo"} {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-bold">Review notes</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {notes.length === 0 && <li className="text-slate-500">No notes yet.</li>}
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-slate-100 p-2">
              {n.atSeconds !== null && <button type="button" onClick={() => jump(n)} className="mr-2 rounded bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white">{clock(n.atSeconds)}</button>}
              <span className="whitespace-pre-line">{n.body}</span>
              <form action={deleteNote} className="mt-1"><input type="hidden" name="id" value={n.id} /><input type="hidden" name="visitId" value={visitId} /><button className="text-xs text-red-700 underline">Remove</button></form>
            </li>
          ))}
        </ul>
        <form action={addNote} className="mt-3 space-y-2">
          <input type="hidden" name="visitId" value={visitId} />
          <input type="hidden" name="mediaId" value={at !== null ? current : ""} />
          <input type="hidden" name="atSeconds" value={at ?? ""} />
          <textarea className="input" name="body" rows={3} maxLength={1000} required placeholder="e.g. 200 A panel, room for a transfer switch on the left" />
          {isVideo && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={at !== null} onChange={(e) => setAt(e.target.checked ? Math.floor(video.current?.currentTime ?? 0) : null)} />
              Pin to the current moment in the video{at !== null && ` (${clock(at)})`}
            </label>
          )}
          <button className="btn btn-ghost w-full">Add note</button>
        </form>
      </div>
    </div>
  );
}
