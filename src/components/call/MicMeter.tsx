"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shows whether the microphone is actually picking up sound, so "they can't
 * hear me" can be checked at a glance. Listens only; nothing is recorded.
 */
export function MicMeter({ stream, muted }: { stream: MediaStream | null; muted: boolean }) {
  const bar = useRef<HTMLSpanElement>(null);
  const [silent, setSilent] = useState(false);
  const track = stream?.getAudioTracks()[0];
  const trackId = track?.id;

  useEffect(() => {
    if (!stream || !trackId) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let heardAt = Date.now();
    const t = setInterval(() => {
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      const level = Math.min(1, peak / 50);
      if (bar.current) bar.current.style.width = `${Math.round(level * 100)}%`;
      if (peak > 3) heardAt = Date.now();
      setSilent(Date.now() - heardAt > 6000);
    }, 120);
    return () => {
      clearInterval(t);
      source.disconnect();
      void ctx.close().catch(() => {});
    };
  }, [stream, trackId]);

  if (!track) return null;
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0">Your microphone</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/15" role="img" aria-label="Microphone level">
          <span ref={bar} className={`block h-full w-0 rounded-full transition-[width] duration-100 ${muted ? "bg-slate-500" : "bg-green-400"}`} />
        </span>
      </div>
      {muted ? (
        <p className="mt-1 text-amber-300">You are muted. The customer can&apos;t hear you.</p>
      ) : silent ? (
        <p className="mt-1 text-amber-300">No sound is coming from this microphone. Click the small arrow on the microphone button and choose a different one.</p>
      ) : (
        <p className="mt-1 text-slate-400">The bar should move when you talk.</p>
      )}
    </div>
  );
}
