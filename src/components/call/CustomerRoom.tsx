"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { saveVisitLocation } from "@/app/actions";
import { CallButton, frameToBox, PointerMark, statusText, Video } from "./Video";
import { useCall } from "./useCall";

/** Shows the specialist's "look here" ring on the customer's own camera view for a few seconds. */
function TimedPointer({ pointer, video }: { pointer: { x: number; y: number }; video: React.RefObject<HTMLVideoElement | null> }) {
  const [at, setAt] = useState<{ left: string; top: string } | null>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setAt(frameToBox(video.current, pointer, "cover")));
    const t = setTimeout(() => setAt(null), 5000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [pointer, video]);
  return at ? <PointerMark at={at} /> : null;
}

/** The customer's side of a virtual visit: their camera fills the screen so they can show the site. */
export function CustomerRoom({ token, business, firstName, iceServers }: { token: string; business: string; firstName: string; iceServers: RTCIceServer[] }) {
  const call = useCall({ role: "customer", signalUrl: `/api/call/${token}/signal`, iceServers });
  const live = call.status === "waiting" || call.status === "connecting" || call.status === "connected";
  const ownVideo = useRef<HTMLVideoElement>(null);
  const [repPicture, setRepPicture] = useState(false);
  const [upright, setUpright] = useState(false);
  const [hintClosed, setHintClosed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  // When the specialist presses Snapshot, send a still straight from this phone's
  // camera at its full quality (the live video is compressed and less sharp).
  const { snapAsked, photoDone } = call;
  useEffect(() => {
    if (!snapAsked) return;
    let cancelled = false;
    void (async () => {
      const v = ownVideo.current;
      let ok = false;
      try {
        if (v && v.videoWidth) {
          const canvas = document.createElement("canvas");
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          canvas.getContext("2d")!.drawImage(v, 0, 0);
          const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
          if (blob && blob.size <= 4 * 1024 * 1024) {
            ok = (await fetch(`/api/call/${token}/photo`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob })).ok;
          }
        }
      } catch {
        ok = false;
      }
      if (!cancelled) photoDone(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [snapAsked, photoDone, token]);

  /** Only runs when the customer taps Share. Their phone then asks them again before giving the location. */
  const shareLocation = () => {
    if (!navigator.geolocation) return call.answerLocation(null);
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const shared = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        await saveVisitLocation(token, shared).catch(() => undefined);
        setLocating(false);
        call.answerLocation(shared);
      },
      () => {
        setLocating(false);
        setLocError("We couldn't get your location. You can allow it in your phone's settings, or skip this.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  if (!live) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10 text-center text-white">
        <h1 className="text-3xl font-extrabold">{call.status === "ended" ? "Call ended" : "Your virtual visit"}</h1>
        <p className="mt-3 text-slate-300">
          {call.status === "ended"
            ? `Thanks, ${firstName}. We'll follow up with your estimate.`
            : `Hi ${firstName}. Tap the button to join ${business}. You'll be asked to allow your camera and microphone, and your back camera is used so you can show us your panel and where the generator would go.`}
        </p>
        {call.error && <p role="alert" className="mt-4 rounded-lg bg-red-950 p-3 text-sm text-red-200">{call.error}</p>}
        <button type="button" className="btn btn-primary mt-6 py-4 text-lg" disabled={call.status === "starting"} onClick={() => void call.start()}>
          {call.status === "starting" ? "Starting camera…" : call.status === "ended" ? "Rejoin call" : "Join video call"}
        </button>
        <Link href={`/visit/${token}`} className="mt-4 text-sm text-slate-400 underline">Back to your visit page</Link>
      </div>
    );
  }

  // While the specialist shows their screen, it takes the main view and the customer's camera shrinks to the corner.
  const repShown = call.repVideo && repPicture; // the specialist is sending a picture and frames have arrived
  const showingScreen = call.sharing && repShown;
  const tile = "absolute top-14 right-3 z-10 h-36 w-24 overflow-hidden rounded-xl border border-white/30 bg-slate-900 shadow-lg sm:h-48 sm:w-36";
  const main = "absolute inset-0 h-full w-full";

  return (
    <div className="relative h-dvh overflow-hidden bg-black text-white">
      {/* Their own camera: what the specialist sees. */}
      <div className={showingScreen ? tile : main}>
        <Video ref={ownVideo} stream={call.local} muted mirror={call.facing === "user"} className="h-full w-full object-cover" onPicture={() => setUpright(Boolean(ownVideo.current && ownVideo.current.videoHeight > ownVideo.current.videoWidth))} />
        {!showingScreen && call.pointer && <TimedPointer key={call.pointer.at} pointer={call.pointer} video={ownVideo} />}
      </div>
      {call.cameraOff && !showingScreen && (
        <p className="absolute inset-0 grid place-items-center bg-black px-6 text-center text-slate-400">
          {call.hasCamera
            ? "Your camera is off"
            : call.cameraProblem === "busy"
              ? "Your camera is being used by another app. Close it, then leave and rejoin."
              : "This device doesn't have a camera we can use, so we can hear you but not see your site. Open this same link on your phone to show us with its camera."}
        </p>
      )}

      {/* The specialist: small in the corner, or full screen while they share their screen. */}
      <div className={showingScreen ? main : tile}>
        <Video stream={call.remote} onPicture={setRepPicture} className={`h-full w-full ${showingScreen ? "object-contain" : "object-cover"} ${repShown ? "" : "opacity-0"}`} />
        {!repShown && <p className="absolute inset-0 grid place-items-center px-1 text-center text-xs text-slate-400">{call.status === "connected" ? `${business} (voice only)` : "Specialist joining…"}</p>}
      </div>

      <p role="status" className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6 text-center text-sm font-semibold">
        {showingScreen ? `${business} is showing you their screen` : call.status === "connected" ? `Connected with ${business}` : call.status === "waiting" ? `We've let ${business} know you're here. Please stay on this page.` : statusText[call.status]}
      </p>

      {call.status === "connected" && upright && !hintClosed && !showingScreen && call.hasCamera && (
        <button type="button" onClick={() => setHintClosed(true)} className="absolute inset-x-4 top-24 z-10 mx-auto max-w-xs rounded-xl bg-black/75 px-4 py-3 text-center text-sm font-semibold">
          Turn your phone sideways for a wider view. <span className="font-normal text-slate-300">Tap to hide.</span>
        </button>
      )}

      {call.locationAsked && (
        <div role="dialog" aria-modal="true" aria-label="Share your location" className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-5">
          <div className="max-w-sm rounded-2xl bg-white p-5 text-center text-slate-900">
            <h2 className="text-xl font-extrabold">Share your location?</h2>
            <p className="mt-2 text-sm text-slate-600">{business} would like the exact location of your property to plan the visit. It&apos;s saved with your request and used only for that.</p>
            {locError && <p role="alert" className="mt-3 text-sm text-red-700">{locError}</p>}
            <div className="mt-4 flex gap-3">
              <button type="button" className="btn btn-ghost flex-1" disabled={locating} onClick={() => call.answerLocation(null)}>Not now</button>
              <button type="button" className="btn btn-primary flex-1" disabled={locating} onClick={shareLocation}>{locating ? "Finding you…" : "Share"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap justify-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <CallButton onClick={call.toggleMute} icon={call.muted ? "micOff" : "mic"} text={call.muted ? "Unmute" : "Mute"} label={call.muted ? "Unmute microphone" : "Mute microphone"} active={call.muted} />
        <CallButton onClick={() => void call.flipCamera()} icon="flip" text="Flip" label="Switch between front and back camera" disabled={!call.hasCamera} />
        {call.torch !== "unsupported" && <CallButton onClick={() => void call.toggleTorch()} icon="light" text="Light" label={call.torch === "on" ? "Turn flashlight off" : "Turn flashlight on"} active={call.torch === "on"} />}
        <CallButton onClick={call.toggleCamera} icon={call.cameraOff ? "camOff" : "cam"} text="Camera" label={call.cameraOff ? "Turn camera on" : "Turn camera off"} active={call.hasCamera && call.cameraOff} disabled={!call.hasCamera} />
        <CallButton onClick={call.hangUp} icon="end" text="Leave" label="Leave call" danger />
      </div>
    </div>
  );
}
