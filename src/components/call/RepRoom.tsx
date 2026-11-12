"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { MeasureTool, type MeasureMeta } from "../MeasureTool";
import { CallButton, statusText, Video } from "./Video";
import { useCall } from "./useCall";

type Shot = { id: string; url: string; name: string; meta: MeasureMeta | null };
type Note = { id: string; body: string };
type Props = {
  visit: { id: string; name: string; phone: string; email: string; address: string; zip: string; topic: string; details: string };
  iceServers: RTCIceServer[];
  shots: Shot[];
  notes: Note[];
  customerLink: string;
  addNote: (visitId: string, body: string) => Promise<Note[]>;
  saveMeasure: (id: string, meta: MeasureMeta) => Promise<{ ok: boolean }>;
};

const clock = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="border-b border-white/10" open={open}>
      <summary className="cursor-pointer px-4 py-3 font-display text-sm font-bold">{title}</summary>
      <div className="px-4 pb-4 text-sm">{children}</div>
    </details>
  );
}

/** Your side of a virtual visit: the customer's camera, their details, snapshots and notes. */
export function RepRoom({ visit, iceServers, shots: initialShots, notes: initialNotes, customerLink, addNote, saveMeasure }: Props) {
  const call = useCall({ role: "rep", signalUrl: `/admin/call/${visit.id}/signal`, iceServers });
  const [shots, setShots] = useState(initialShots);
  const [notes, setNotes] = useState(initialNotes);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<Shot | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [flash, setFlash] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, startSaving] = useTransition();
  const remoteVideo = useRef<HTMLVideoElement>(null);

  const connected = call.status === "connected";
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [connected]);

  const live = call.status === "waiting" || call.status === "connecting" || connected;
  // "Has a picture" means frames are actually arriving, not just that a video track exists.
  const [hasPicture, setHasPicture] = useState(false);

  /** Grab the current frame of the customer's video at its full resolution. */
  const snapshot = async () => {
    const v = remoteVideo.current;
    if (!v || !v.videoWidth) return setFlash("No picture from the customer yet.");
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return setFlash("Couldn't capture the picture.");
    setFlash("Saving snapshot…");
    try {
      const res = await fetch(`/admin/call/${visit.id}/snapshot`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      const data = await res.json();
      if (!res.ok) return setFlash(data.error ?? "Couldn't save the snapshot.");
      setShots((s) => [...s, data]);
      setFlash("Snapshot saved.");
    } catch {
      setFlash("Couldn't save the snapshot.");
    }
  };

  const submitNote = () => {
    const body = note.trim();
    if (!body) return;
    startSaving(async () => {
      setNotes(await addNote(visit.id, body));
      setNote("");
    });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-white">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 px-4 py-3 text-sm">
        <span className="font-display font-extrabold text-brand">VIRTUAL VISIT</span>
        <span className="font-semibold">{visit.name}</span>
        {visit.address && <span className="text-slate-400">{visit.address} {visit.zip}</span>}
        <span className="flex-1" />
        <span role="status" className="text-slate-300">{connected ? clock(seconds) : statusText[call.status]}</span>
        <Link href={`/admin/visits/${visit.id}`} className="underline">Back to visit</Link>
      </header>

      <div className="grid flex-1 lg:grid-cols-[1fr_360px]">
        <div className="relative flex min-h-[50vh] flex-col bg-black">
          {!live ? (
            <div className="m-auto max-w-md p-6 text-center">
              <h1 className="text-2xl font-extrabold">{call.status === "ended" ? "Call ended" : "Ready to start"}</h1>
              <p className="mt-2 text-sm text-slate-300">Send the customer their link, then start the call. They join from their phone&apos;s browser; there is nothing for them to install.</p>
              <div className="mt-4 rounded-lg bg-white/10 p-3 text-left text-xs">
                <p className="break-all">{customerLink}</p>
                <button type="button" className="mt-2 font-bold text-brand underline" onClick={() => { void navigator.clipboard?.writeText(customerLink).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy customer link"}</button>
              </div>
              {call.error && <p role="alert" className="mt-4 rounded-lg bg-red-950 p-3 text-sm text-red-200">{call.error}</p>}
              <button type="button" className="btn btn-primary mt-5 px-8 py-3 text-base" disabled={call.status === "starting"} onClick={() => void call.start()}>
                {call.status === "starting" ? "Starting camera…" : call.status === "ended" ? "Start again" : "Start video call"}
              </button>
            </div>
          ) : (
            <>
              <Video ref={remoteVideo} stream={call.remote} onPicture={setHasPicture} className="h-full max-h-[calc(100dvh-9.5rem)] w-full flex-1 object-contain" />
              {!hasPicture && <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-slate-400">{connected ? "Waiting for the customer's camera picture…" : statusText[call.status]}</p>}
              {call.hasCamera ? (
                <div className="absolute bottom-24 left-3 h-24 w-36 overflow-hidden rounded-lg border border-white/30 bg-slate-900">
                  <Video stream={call.local} muted mirror className="h-full w-full object-cover" />
                </div>
              ) : (
                <p className="absolute bottom-24 left-3 max-w-56 rounded-lg bg-black/70 px-3 py-2 text-xs text-slate-200">
                  {call.hasMic ? "No camera on this computer. The customer can hear you but not see you." : "No camera or microphone on this computer. You can see and hear the customer, but they can't hear you."}
                </p>
              )}
              {flash && <p role="status" className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-4 py-1.5 text-sm">{flash}</p>}
              <div className="flex justify-center gap-3 border-t border-white/10 bg-slate-950 p-3">
                <CallButton onClick={call.toggleMute} label={call.muted ? "Unmute microphone" : "Mute microphone"} active={call.muted} disabled={!call.hasMic}>{call.muted ? "Unmute" : "Mute"}</CallButton>
                <CallButton onClick={call.toggleCamera} label={call.cameraOff ? "Turn camera on" : "Turn camera off"} active={call.hasCamera && call.cameraOff} disabled={!call.hasCamera}>{call.hasCamera && !call.cameraOff ? "Cam off" : "Cam on"}</CallButton>
                <CallButton onClick={() => void snapshot()} label="Take a snapshot of the customer's video" disabled={!hasPicture}>Snapshot</CallButton>
                <CallButton onClick={call.hangUp} label="End call" danger>End</CallButton>
              </div>
            </>
          )}
        </div>

        <aside className="border-t border-white/10 bg-slate-900 lg:border-t-0 lg:border-l">
          <Section title="Customer details">
            <p><a className="underline" href={`tel:${visit.phone.replace(/[^\d+]/g, "")}`}>{visit.phone}</a><br /><span className="break-all">{visit.email}</span></p>
            {visit.address && <p className="mt-2">{visit.address} {visit.zip}</p>}
            {visit.topic && <p className="mt-2"><strong>Topic:</strong> {visit.topic}</p>}
            {visit.details && <p className="mt-2 whitespace-pre-line text-slate-300">{visit.details}</p>}
          </Section>
          <Section title={`Snapshots (${shots.length})`} open>
            {shots.length === 0 && <p className="text-slate-400">Press Snapshot during the call to save a still, then tap it to measure.</p>}
            <div className="grid grid-cols-2 gap-2">
              {shots.map((s) => (
                <button key={s.id} type="button" onClick={() => setOpen(s)} className="relative overflow-hidden rounded-lg border border-white/20 text-left" aria-label={`Open ${s.name} to measure`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- saved snapshot */}
                  <img src={s.url} alt="" className="aspect-video w-full object-cover" />
                  <span className="block truncate bg-black/60 px-2 py-1 text-xs">{s.meta?.lines?.length ? `${s.meta.lines.length} measured` : "Tap to measure"}</span>
                </button>
              ))}
            </div>
          </Section>
          <Section title={`Notes (${notes.length})`} open>
            <ul className="mb-3 space-y-2">
              {notes.map((n) => <li key={n.id} className="whitespace-pre-line rounded-lg bg-white/10 p-2">{n.body}</li>)}
            </ul>
            <textarea className="input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add notes…" aria-label="Add a note" />
            <button type="button" className="btn btn-primary mt-2 w-full" disabled={saving || !note.trim()} onClick={submitNote}>{saving ? "Saving…" : "Add note"}</button>
          </Section>
        </aside>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Measure snapshot">
          <div className="mx-auto max-w-4xl rounded-2xl bg-white p-4 text-slate-900">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">{open.name}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>Close</button>
            </div>
            <MeasureTool
              mediaId={open.id}
              url={open.url}
              name={open.name}
              initial={open.meta}
              save={async (id, meta) => {
                const res = await saveMeasure(id, meta);
                if (res.ok) setShots((all) => all.map((s) => (s.id === id ? { ...s, meta } : s)));
                return res;
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
