"use client";

import Link from "next/link";
import { CallButton, statusText, Video } from "./Video";
import { useCall } from "./useCall";

/** The customer's side of a virtual visit: their camera fills the screen so they can show the site. */
export function CustomerRoom({ token, business, firstName, iceServers }: { token: string; business: string; firstName: string; iceServers: RTCIceServer[] }) {
  const call = useCall({ role: "customer", signalUrl: `/api/call/${token}/signal`, iceServers });
  const live = call.status === "waiting" || call.status === "connecting" || call.status === "connected";

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

  return (
    <div className="relative h-dvh overflow-hidden bg-black text-white">
      {/* Their own camera, full screen: this is what the specialist sees. */}
      <Video stream={call.local} muted mirror={call.facing === "user"} className="h-full w-full object-cover" />
      {call.cameraOff && <p className="absolute inset-0 grid place-items-center bg-black px-6 text-center text-slate-400">{call.hasCamera ? "Your camera is off" : "We couldn't open your camera. Close other apps using it, then leave and rejoin."}</p>}

      <p role="status" className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6 text-center text-sm font-semibold">
        {call.status === "connected" ? `Connected with ${business}` : statusText[call.status]}
      </p>

      {/* The specialist, small, in the corner. */}
      <div className="absolute top-14 right-3 h-36 w-24 overflow-hidden rounded-xl border border-white/30 bg-slate-900 shadow-lg sm:h-48 sm:w-36">
        {call.remote ? <Video stream={call.remote} className="h-full w-full object-cover" /> : <p className="grid h-full place-items-center px-1 text-center text-xs text-slate-400">Specialist joining…</p>}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <CallButton onClick={call.toggleMute} label={call.muted ? "Unmute microphone" : "Mute microphone"} active={call.muted}>{call.muted ? "Unmute" : "Mute"}</CallButton>
        <CallButton onClick={() => void call.flipCamera()} label="Switch camera">Flip</CallButton>
        <CallButton onClick={call.toggleCamera} label={call.cameraOff ? "Turn camera on" : "Turn camera off"} active={call.cameraOff}>{call.cameraOff ? "Cam on" : "Cam off"}</CallButton>
        <CallButton onClick={call.hangUp} label="Leave call" danger>Leave</CallButton>
      </div>
    </div>
  );
}
