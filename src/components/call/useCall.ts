"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type CallStatus = "idle" | "starting" | "waiting" | "connecting" | "connected" | "ended" | "error";
type Role = "rep" | "customer";
type Facing = "environment" | "user";
type Signal = { id: number; kind: "ready" | "offer" | "answer" | "ice" | "bye"; payload: { sid?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } | null };
type Options = { role: Role; signalUrl: string; iceServers: RTCIceServer[] };

export type CallState = {
  status: CallStatus;
  error: string;
  local: MediaStream | null;
  remote: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  facing: Facing;
  /** Whether this device is sending a camera picture / microphone sound at all. */
  hasCamera: boolean;
  hasMic: boolean;
};

/**
 * One-to-one video call between you (rep) and a customer.
 *
 * The two browsers send each other small setup messages through the server
 * (signalUrl), then audio and video flow directly between them. The rep always
 * makes the offer and the customer answers. Every offer carries a session id
 * (sid) so late messages from an earlier attempt are ignored.
 */
class CallEngine {
  private state: CallState;
  private listeners = new Set<() => void>();
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private sid = "";
  private cursor = 0;
  private pendingIce: RTCIceCandidateInit[] = [];
  private alive = false;

  constructor(private opts: Options) {
    this.state = { status: "idle", error: "", local: null, remote: null, muted: false, cameraOff: false, facing: opts.role === "customer" ? "environment" : "user", hasCamera: false, hasMic: false };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private send(kind: Signal["kind"], payload?: Signal["payload"]) {
    return fetch(this.opts.signalUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, payload }), keepalive: kind === "bye" }).catch(() => undefined);
  }

  private closePeer() {
    this.pc?.close();
    this.pc = null;
    this.pendingIce = [];
    this.set({ remote: null });
  }

  private newPeer() {
    this.closePeer();
    const p = new RTCPeerConnection({ iceServers: this.opts.iceServers });
    this.pc = p;
    this.stream?.getTracks().forEach((t) => p.addTrack(t, this.stream!));
    if (this.opts.role === "rep") {
      // The rep makes the offer, and an offer only asks for what it lists. If this
      // computer has no camera (or no microphone), still ask to RECEIVE the
      // customer's picture and sound; otherwise their video would never be sent.
      if (!this.stream?.getVideoTracks().length) p.addTransceiver("video", { direction: "recvonly" });
      if (!this.stream?.getAudioTracks().length) p.addTransceiver("audio", { direction: "recvonly" });
    }
    p.onicecandidate = (e) => {
      if (e.candidate) void this.send("ice", { sid: this.sid, candidate: e.candidate.toJSON() });
    };
    // Sound and picture arrive as separate tracks. Build a fresh stream from
    // everything received so far, so the screen updates as each one arrives.
    p.ontrack = () => {
      if (this.pc === p) this.set({ remote: new MediaStream(p.getReceivers().map((r) => r.track).filter((t) => t.readyState === "live")) });
    };
    p.onconnectionstatechange = () => {
      if (this.pc !== p) return;
      if (p.connectionState === "connected") this.set({ status: "connected" });
      else if (p.connectionState === "disconnected") this.set({ status: "connecting" });
      else if (p.connectionState === "failed") {
        this.set({ status: "connecting" });
        // The rep retries; the customer waits for the new offer.
        if (this.opts.role === "rep") void this.offer();
      }
    };
    return p;
  }

  private async offer() {
    this.sid = crypto.randomUUID();
    const p = this.newPeer();
    this.set({ status: "connecting" });
    const sdp = await p.createOffer();
    await p.setLocalDescription(sdp);
    await this.send("offer", { sid: this.sid, sdp });
  }

  private async flushIce() {
    if (!this.pc?.remoteDescription) return;
    for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => undefined);
  }

  private async handle(m: Signal) {
    const body = m.payload ?? {};
    const { role } = this.opts;
    if (m.kind === "bye") {
      this.closePeer();
      this.set({ status: "waiting" });
    } else if (m.kind === "ready") {
      // The other side just arrived (or reloaded): start a fresh connection.
      if (role === "rep") await this.offer();
      else await this.send("ready");
    } else if (m.kind === "offer") {
      if (role !== "customer" || !body.sdp || !body.sid) return;
      this.sid = body.sid;
      const p = this.newPeer();
      this.set({ status: "connecting" });
      await p.setRemoteDescription(body.sdp);
      const answer = await p.createAnswer();
      await p.setLocalDescription(answer);
      await this.send("answer", { sid: this.sid, sdp: answer });
      await this.flushIce();
    } else if (body.sid !== this.sid) {
      return; // from an earlier attempt
    } else if (m.kind === "answer") {
      if (role === "rep" && body.sdp && this.pc && !this.pc.remoteDescription) {
        await this.pc.setRemoteDescription(body.sdp);
        await this.flushIce();
      }
    } else if (m.kind === "ice" && body.candidate) {
      this.pendingIce.push(body.candidate);
      await this.flushIce();
    }
  }

  private poll = async () => {
    if (!this.alive) return;
    try {
      const res = await fetch(`${this.opts.signalUrl}?after=${this.cursor}`);
      if (res.ok) {
        const data: { cursor: number; messages: Signal[] } = await res.json();
        this.cursor = data.cursor;
        for (const m of data.messages) await this.handle(m).catch(() => undefined);
      }
    } catch {
      /* network blip: try again on the next tick */
    }
    // Check often while connecting, less often once the call is up.
    if (this.alive) setTimeout(this.poll, this.state.status === "connected" ? 3000 : 1000);
  };

  /** Must be called from a button press so the browser allows camera, microphone and sound. */
  start = async () => {
    if (this.alive) return;
    this.set({ status: "starting", error: "" });
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const video = { facingMode: { ideal: this.state.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } };
      const denied = (err: unknown) => err instanceof Error && /NotAllowed|Permission/.test(err.name);
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      } catch (err) {
        if (denied(err)) throw err;
        try {
          // No usable camera: carry on with sound only.
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err2) {
          // No microphone either. The rep can still watch and listen; a customer needs at least a microphone.
          if (denied(err2) || this.opts.role !== "rep") throw err2;
          this.stream = new MediaStream();
        }
      }
      const hasCamera = this.stream.getVideoTracks().length > 0;
      this.set({ local: this.stream, hasCamera, hasMic: this.stream.getAudioTracks().length > 0, cameraOff: !hasCamera });
      const init = await fetch(`${this.opts.signalUrl}?init=1`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("signal"))));
      this.cursor = init.cursor;
      this.alive = true;
      this.set({ status: "waiting" });
      await this.send("ready");
      void this.poll();
    } catch (err) {
      const name = err instanceof Error ? err.name + err.message : "";
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.set({
        status: "error",
        local: null,
        error: /NotAllowed|Permission/.test(name)
          ? "Camera and microphone access was blocked. Allow it in your browser settings, then try again."
          : /unsupported/.test(name)
            ? "This browser can't make video calls. Try Safari on iPhone or Chrome on Android."
            : "We couldn't start the call. Check your connection and try again.",
      });
    }
  };

  hangUp = () => {
    if (!this.alive) return;
    this.alive = false;
    void this.send("bye");
    this.closePeer();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.set({ status: "ended", local: null });
  };

  toggleMute = () => {
    const muted = !this.state.muted;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.set({ muted });
  };

  toggleCamera = () => {
    const cameraOff = !this.state.cameraOff;
    this.stream?.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
    this.set({ cameraOff });
  };

  /** Switch between the back and front camera without dropping the call. */
  flipCamera = async () => {
    const next: Facing = this.state.facing === "environment" ? "user" : "environment";
    const old = this.stream?.getVideoTracks()[0];
    try {
      // Phones can't open both cameras at once, so release the current one first.
      old?.stop();
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: next }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      const track = fresh.getVideoTracks()[0];
      await this.pc?.getSenders().find((s) => s.track?.kind === "video" || s.track === old)?.replaceTrack(track);
      if (old) this.stream?.removeTrack(old);
      this.stream?.addTrack(track);
      this.set({ facing: next, cameraOff: false, hasCamera: true, local: new MediaStream(this.stream?.getTracks() ?? [track]) });
    } catch {
      /* this device has only one camera */
    }
  };

  /** Called when the page is left. */
  dispose = () => {
    if (this.alive) void this.send("bye");
    this.alive = false;
    this.pc?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
  };
}

export function useCall(opts: Options) {
  const [engine] = useState(() => new CallEngine(opts));
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
  useEffect(() => {
    window.addEventListener("pagehide", engine.dispose);
    return () => {
      window.removeEventListener("pagehide", engine.dispose);
      engine.dispose();
    };
  }, [engine]);
  return { ...state, start: engine.start, hangUp: engine.hangUp, toggleMute: engine.toggleMute, toggleCamera: engine.toggleCamera, flipCamera: engine.flipCamera };
}
