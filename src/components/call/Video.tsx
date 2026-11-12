"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/** A <video> that plays a live stream. `muted` is for your own picture, so you don't hear yourself. */
type VideoProps = { stream: MediaStream | null; muted?: boolean; className?: string; mirror?: boolean; onPicture?: (showing: boolean) => void };

export const Video = forwardRef<HTMLVideoElement, VideoProps>(function Video({ stream, muted = false, className = "", mirror = false, onPicture }, ref) {
  const el = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => el.current!, []);
  useEffect(() => {
    if (!el.current) return;
    el.current.srcObject = stream;
    if (stream) void el.current.play().catch(() => {});
  }, [stream]);
  // Reports whether real frames are on screen (the picture has a size).
  const report = () => onPicture?.(Boolean(el.current && el.current.videoWidth > 0));
  return (
    <video
      ref={el}
      autoPlay
      playsInline
      muted={muted}
      onLoadedMetadata={report}
      onResize={report}
      onPlaying={report}
      onEmptied={() => onPicture?.(false)}
      className={`${className} ${mirror ? "-scale-x-100" : ""}`}
    />
  );
});

export const statusText: Record<string, string> = {
  idle: "",
  starting: "Starting camera…",
  waiting: "Waiting for the other person to join…",
  connecting: "Connecting…",
  connected: "Connected",
  ended: "Call ended",
  error: "",
};

export function CallButton({ onClick, label, active = false, danger = false, disabled = false, children }: { onClick: () => void; label: string; active?: boolean; danger?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid h-14 min-w-14 place-items-center rounded-full px-4 text-sm font-bold transition disabled:opacity-40 ${danger ? "bg-red-600 text-white hover:bg-red-500" : active ? "bg-brand text-black" : "bg-white/15 text-white hover:bg-white/25"}`}
    >
      {children}
    </button>
  );
}
