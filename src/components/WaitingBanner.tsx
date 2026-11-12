"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Waiting = { id: string; name: string };

/** Two short tones. Browsers only allow sound after you've clicked somewhere on the page. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25].forEach((at, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.25);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    /* sound not available: the banner still shows */
  }
}

/**
 * Shown on every admin page. When a customer has joined a video call and
 * nobody on your side is in the room, a banner appears with a Join button.
 * It checks every 15 seconds around a scheduled call time and every 5 minutes
 * otherwise, so an idle admin tab costs almost nothing.
 */
export function WaitingBanner() {
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const known = useRef("");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const check = async () => {
      let soon = false;
      try {
        const res = await fetch("/admin/call/waiting");
        if (res.ok) {
          const data: { waiting: Waiting[]; soon: boolean } = await res.json();
          soon = data.soon;
          const ids = data.waiting.map((w) => w.id).join(",");
          if (ids && ids !== known.current) {
            chime();
            document.title = `Customer waiting · ${document.title.replace(/^Customer waiting · /, "")}`;
          }
          if (!ids) document.title = document.title.replace(/^Customer waiting · /, "");
          known.current = ids;
          setWaiting(data.waiting);
        }
      } catch {
        /* offline: try again next time */
      }
      if (!stopped) timer = setTimeout(check, soon ? 15_000 : 300_000);
    };
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  if (waiting.length === 0) return null;
  return (
    <div role="alert" className="bg-brand text-black">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        {waiting.map((w) => (
          <p key={w.id} className="flex flex-1 flex-wrap items-center gap-3 font-display font-bold">
            <span>{w.name} is waiting in the video call.</span>
            <Link href={`/admin/call/${w.id}`} className="btn btn-dark">Join now</Link>
          </p>
        ))}
      </div>
    </div>
  );
}
