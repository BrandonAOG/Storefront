"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Icon } from "./Icons";

type VideoProps = {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  mirror?: boolean;
  /** Which speaker to play through (where the browser supports choosing). */
  sinkId?: string;
  onPicture?: (showing: boolean) => void;
  /** Called with true when the browser refuses to play sound until the person taps the page. */
  onBlocked?: (blocked: boolean) => void;
  style?: React.CSSProperties;
};

/** A <video> that plays a live stream. `muted` is for your own picture, so you don't hear yourself. */
export const Video = forwardRef<HTMLVideoElement, VideoProps>(function Video({ stream, muted = false, className = "", mirror = false, sinkId, onPicture, onBlocked, style }, ref) {
  const el = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => el.current!, []);
  useEffect(() => {
    if (!el.current) return;
    const v = el.current;
    v.srcObject = stream;
    if (!stream) return;
    let retry: (() => void) | null = null;
    v.play().then(
      () => onBlocked?.(false),
      (err: unknown) => {
        // Phones can refuse to play sound until the person touches the page. Start it on their next tap.
        if (!(err instanceof DOMException) || err.name !== "NotAllowedError") return;
        onBlocked?.(true);
        retry = () => void v.play().then(() => onBlocked?.(false), () => {});
        document.addEventListener("pointerdown", retry, { once: true });
      },
    );
    return () => {
      if (retry) document.removeEventListener("pointerdown", retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only restart playback when the stream itself changes
  }, [stream]);
  useEffect(() => {
    const v = el.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (sinkId && v?.setSinkId) void v.setSinkId(sinkId).catch(() => {});
  }, [sinkId]);
  // Phones sometimes pause a live picture when the layout changes or the page
  // returns from the background. A live stream should always be playing.
  const resume = () => {
    const v = el.current;
    if (v && v.srcObject && (v.srcObject as MediaStream).active && v.paused) void v.play().catch(() => {});
  };
  useEffect(() => {
    document.addEventListener("visibilitychange", resume);
    const t = setInterval(resume, 2000);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      clearInterval(t);
    };
  }, []);
  // Reports whether real frames are on screen (the picture has a size).
  const report = () => onPicture?.(Boolean(el.current && el.current.videoWidth > 0));
  return (
    <video
      ref={el}
      autoPlay
      playsInline
      muted={muted}
      style={style}
      onLoadedMetadata={report}
      onResize={report}
      onPlaying={() => {
        report();
        onBlocked?.(false);
      }}
      onPause={resume}
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

type ButtonProps = { onClick: () => void; label: string; icon: string; active?: boolean; danger?: boolean; disabled?: boolean; text?: string };

/** Round icon button. The label is read by screen readers and shown on hover. */
export function CallButton({ onClick, label, icon, active = false, danger = false, disabled = false, text }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex h-14 min-w-14 flex-col items-center justify-center rounded-full px-3 transition disabled:opacity-35 ${danger ? "bg-red-600 px-6 text-white hover:bg-red-500" : active ? "bg-brand text-black" : "bg-white/15 text-white hover:bg-white/25"}`}
    >
      <Icon name={icon} />
      {text && <span className="text-[10px] font-bold leading-none">{text}</span>}
    </button>
  );
}

/** Where a tap or pointer lands on a video's picture, as 0..1 across and down the frame. */
export function frameFromClick(video: HTMLVideoElement, clientX: number, clientY: number, fit: "contain" | "cover"): { x: number; y: number } | null {
  const r = video.getBoundingClientRect();
  if (!video.videoWidth || !r.width) return null;
  const scale = fit === "contain" ? Math.min(r.width / video.videoWidth, r.height / video.videoHeight) : Math.max(r.width / video.videoWidth, r.height / video.videoHeight);
  const w = video.videoWidth * scale;
  const h = video.videoHeight * scale;
  const x = (clientX - r.left - (r.width - w) / 2) / w;
  const y = (clientY - r.top - (r.height - h) / 2) / h;
  return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
}

/** The reverse: where a point on the frame sits on screen, as % of the video element's box. */
export function frameToBox(video: HTMLVideoElement | null, p: { x: number; y: number }, fit: "contain" | "cover"): { left: string; top: string } | null {
  if (!video?.videoWidth) return null;
  const r = video.getBoundingClientRect();
  const scale = fit === "contain" ? Math.min(r.width / video.videoWidth, r.height / video.videoHeight) : Math.max(r.width / video.videoWidth, r.height / video.videoHeight);
  const w = video.videoWidth * scale;
  const h = video.videoHeight * scale;
  return { left: `${(((r.width - w) / 2 + p.x * w) / r.width) * 100}%`, top: `${(((r.height - h) / 2 + p.y * h) / r.height) * 100}%` };
}

/** The pulsing "look here" ring. */
export function PointerMark({ at }: { at: { left: string; top: string } }) {
  return (
    <span className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2" style={at} aria-hidden>
      <span className="absolute -inset-5 animate-ping rounded-full border-4 border-brand" />
      <span className="block h-10 w-10 rounded-full border-4 border-brand bg-brand/25 shadow-[0_0_0_2px_rgba(0,0,0,0.6)]" />
    </span>
  );
}
