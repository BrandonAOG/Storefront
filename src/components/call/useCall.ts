"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type CallStatus = "idle" | "starting" | "waiting" | "connecting" | "connected" | "ended" | "error";
type Role = "rep" | "customer";
type Facing = "environment" | "user";
type Signal = { id: number; kind: "ready" | "offer" | "answer" | "ice" | "bye"; payload: { sid?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } | null };
type Options = { role: Role; signalUrl: string; iceServers: RTCIceServer[] };
export type Device = { id: string; label: string };
export type Shared = { lat: number; lng: number; accuracy: number };
/** Small messages sent directly between the two browsers during a call. */
type Control =
  | { t: "point"; x: number; y: number }
  | { t: "share"; on: boolean }
  | { t: "video"; on: boolean }
  | { t: "caps"; zoomMin?: number; zoomMax?: number; zoomStep?: number }
  | { t: "zoom"; value: number }
  | { t: "snap" }
  | { t: "photo"; ok: boolean }
  | { t: "locate" }
  | { t: "location"; lat?: number; lng?: number; accuracy?: number; declined?: boolean };

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
  /** Why there is no camera picture: the device has none, or something else is using it. */
  cameraProblem: "" | "missing" | "busy";
  /** Rep: this computer's screen is being shown to the customer. Customer: the rep is showing their screen. */
  sharing: boolean;
  /** The other side's camera has stopped sending frames (their phone paused it or they switched apps). */
  remotePaused: boolean;
  /** Customer: the rep is currently sending a picture (camera or screen), not just sound. */
  repVideo: boolean;
  /** Devices to choose from, and which are in use. */
  mics: Device[];
  cameras: Device[];
  speakers: Device[];
  micId: string;
  cameraId: string;
  speakerId: string;
  /** A "look here" mark on the customer's picture (0..1 across and down), with when it was set. */
  pointer: { x: number; y: number; at: number } | null;
  /** Customer: the rep has asked to see their location. */
  locationAsked: boolean;
  /** Rep: what came back. */
  location: Shared | "asked" | "declined" | null;
  /** Rep: the customer's real camera zoom range, when their phone lets a web page control it. */
  remoteZoom: { min: number; max: number; step: number; value: number } | null;
  /** Customer: counts requests from the rep for a full-quality still. */
  snapAsked: number;
  /** Customer: phone flashlight available / on. */
  torch: "unsupported" | "off" | "on";
};

const initial = (role: Role): CallState => ({
  status: "idle", error: "", local: null, remote: null, muted: false, cameraOff: false, facing: role === "customer" ? "environment" : "user",
  hasCamera: false, hasMic: false, cameraProblem: "", sharing: false, remotePaused: false, repVideo: false, mics: [], cameras: [], speakers: [], micId: "", cameraId: "", speakerId: "",
  pointer: null, locationAsked: false, location: null, remoteZoom: null, snapAsked: 0, torch: "unsupported",
});

/**
 * One-to-one video call between you (rep) and a customer.
 *
 * The two browsers send each other small setup messages through the server
 * (signalUrl), then audio, video and control messages flow directly between
 * them. The rep always makes the offer and the customer answers. Every offer
 * carries a session id (sid) so late messages from an earlier attempt are ignored.
 */
class CallEngine {
  private state: CallState;
  private listeners = new Set<() => void>();
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private screen: MediaStreamTrack | null = null;
  /** Rep: resolves when the customer's phone has sent (or failed to send) a full-quality still. */
  private photoWaiter: ((ok: boolean) => void) | null = null;
  /** Rep: the last location the customer actually shared in this call. */
  private shared: Shared | null = null;
  private sid = "";
  private cursor = 0;
  private pendingIce: RTCIceCandidateInit[] = [];
  private alive = false;

  constructor(private opts: Options) {
    this.state = initial(opts.role);
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

  private control(msg: Control) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(msg));
  }

  private onControl = (raw: unknown) => {
    let m: Control;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
    if (m.t === "point" && num(m.x) && num(m.y)) this.set({ pointer: { x: Math.min(1, Math.max(0, m.x)), y: Math.min(1, Math.max(0, m.y)), at: Date.now() } });
    else if (m.t === "share" && this.opts.role === "customer") {
      this.set({ sharing: Boolean(m.on) });
      // Some phones pause their own camera while another picture takes over the screen. Make sure it is running again.
      if (!m.on) void this.ensureCamera();
    }
    else if (m.t === "video" && this.opts.role === "customer") this.set({ repVideo: Boolean(m.on) });
    else if (m.t === "locate" && this.opts.role === "customer") this.set({ locationAsked: true });
    else if (m.t === "caps" && this.opts.role === "rep") {
      const ok = num(m.zoomMin) && num(m.zoomMax) && m.zoomMax! > m.zoomMin!;
      this.set({ remoteZoom: ok ? { min: m.zoomMin!, max: m.zoomMax!, step: num(m.zoomStep) && m.zoomStep! > 0 ? m.zoomStep! : 0.1, value: m.zoomMin! } : null });
    } else if (m.t === "zoom" && this.opts.role === "customer" && num(m.value)) void this.applyZoom(m.value);
    else if (m.t === "snap" && this.opts.role === "customer") this.set({ snapAsked: this.state.snapAsked + 1 });
    else if (m.t === "photo" && this.opts.role === "rep") {
      this.photoWaiter?.(Boolean(m.ok));
      this.photoWaiter = null;
    }
    else if (m.t === "location" && this.opts.role === "rep") {
      // A "no thanks" never wipes out a location the customer already shared.
      if (m.declined || !num(m.lat) || !num(m.lng)) this.set({ location: this.shared ?? "declined" });
      else {
        this.shared = { lat: m.lat!, lng: m.lng!, accuracy: num(m.accuracy) ? m.accuracy! : 0 };
        this.set({ location: this.shared });
      }
    }
  };

  private wireChannel(ch: RTCDataChannel) {
    this.dc = ch;
    ch.onmessage = (e) => this.onControl(e.data);
    // Tell a customer who (re)connects whether a screen share is already running.
    ch.onopen = () => {
      if (this.opts.role === "rep") this.tellVideo();
      else this.tellCaps();
    };
  }

  /** Restart this device's camera if the phone stopped it, and keep sending it. */
  private async ensureCamera() {
    const track = this.stream?.getVideoTracks()[0];
    if (!this.alive || !this.state.hasCamera || this.state.cameraOff) return;
    if (track && track.readyState === "live") return;
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: this.state.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      await this.swapTrack("video", fresh.getVideoTracks()[0], true);
      this.watchCamera();
      void this.preferSharpness();
    } catch {
      /* camera still unavailable: the customer can leave and rejoin */
    }
  }

  /** If the phone ends the camera on its own (another app took it), bring it back. */
  private watchCamera() {
    const track = this.stream?.getVideoTracks()[0];
    if (track) track.onended = () => void this.ensureCamera();
  }

  /** Customer: tell the rep what this phone's camera can do (real zoom range, if any). */
  private tellCaps() {
    const caps = (this.stream?.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number; step?: number } };
    this.control(caps.zoom ? { t: "caps", zoomMin: caps.zoom.min, zoomMax: caps.zoom.max, zoomStep: caps.zoom.step } : { t: "caps" });
  }

  /** Customer: change this phone's real camera zoom, at the rep's request. */
  private async applyZoom(value: number) {
    const track = this.stream?.getVideoTracks()[0];
    const caps = (track?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number } };
    if (!track || !caps.zoom) return;
    const zoom = Math.min(caps.zoom.max, Math.max(caps.zoom.min, value));
    await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] }).catch(() => undefined);
  }

  /**
   * Customer: favor a sharp picture over a smooth one. A site walk-through is
   * mostly still shots of labels and equipment, so when the connection is
   * tight it is better to drop frames than to blur the image.
   */
  private async preferSharpness() {
    const sender = this.pc?.getSenders().find((s) => s.track?.kind === "video");
    if (!sender?.track) return;
    try {
      sender.track.contentHint = "detail";
      const p = sender.getParameters();
      p.degradationPreference = "maintain-resolution";
      if (p.encodings?.[0]) p.encodings[0].maxBitrate = 2_500_000;
      await sender.setParameters(p);
    } catch {
      /* not supported in this browser: the call still works */
    }
  }

  /** Rep: tell the customer whether a picture is being sent, and whether it is the screen. */
  private tellVideo() {
    const camOn = Boolean(this.stream?.getVideoTracks().length) && !this.state.cameraOff;
    this.control({ t: "share", on: this.state.sharing });
    this.control({ t: "video", on: this.state.sharing || camOn });
  }

  private closePeer() {
    this.pc?.close();
    this.pc = null;
    this.dc = null;
    this.pendingIce = [];
    this.set({ remote: null, pointer: null, remoteZoom: null, remotePaused: false });
  }

  /** The outgoing sender for sound or picture, whether or not it has a track yet. */
  private sender(kind: "audio" | "video") {
    return this.pc?.getTransceivers().find((t) => t.sender.track?.kind === kind || t.receiver.track?.kind === kind)?.sender;
  }

  private newPeer() {
    this.closePeer();
    const p = new RTCPeerConnection({ iceServers: this.opts.iceServers });
    this.pc = p;
    if (this.opts.role === "rep") {
      // The rep makes the offer, and an offer only covers what it lists. Always
      // set up two-way sound and picture, even with no microphone or camera on
      // this computer, so the customer's video is received and a screen share
      // or a device plugged in later can be sent without reconnecting.
      const audio = this.stream?.getAudioTracks()[0];
      const video = this.screen ?? this.stream?.getVideoTracks()[0];
      if (audio) p.addTrack(audio, this.stream!);
      else p.addTransceiver("audio", { direction: "sendrecv" });
      if (video) p.addTrack(video, this.stream!);
      else p.addTransceiver("video", { direction: "sendrecv" });
      this.wireChannel(p.createDataChannel("control"));
    } else {
      this.stream?.getTracks().forEach((t) => p.addTrack(t, this.stream!));
      p.ondatachannel = (e) => this.wireChannel(e.channel);
    }
    p.onicecandidate = (e) => {
      if (e.candidate) void this.send("ice", { sid: this.sid, candidate: e.candidate.toJSON() });
    };
    // Sound and picture arrive as separate tracks. Build a fresh stream from
    // everything received so far, so the screen updates as each one arrives.
    p.ontrack = (e) => {
      if (this.pc !== p) return;
      this.set({ remote: new MediaStream(p.getReceivers().map((r) => r.track).filter((t) => t.readyState === "live")) });
      if (e.track.kind === "video") {
        // A phone pauses its camera when the browser is put in the background or another app takes over.
        const report = () => {
          if (this.pc === p) this.set({ remotePaused: e.track.muted });
        };
        e.track.onmute = report;
        e.track.onunmute = report;
      }
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
      this.set({ status: "waiting", sharing: role === "rep" ? this.state.sharing : false, repVideo: false, locationAsked: false });
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
      void this.preferSharpness();
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

  /** Lists microphones, cameras and speakers. Names only appear once permission has been given. */
  refreshDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const of = (kind: MediaDeviceKind, fallback: string) =>
        all.filter((d) => d.kind === kind && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
      const settings = (t?: MediaStreamTrack) => t?.getSettings().deviceId ?? "";
      this.set({
        mics: of("audioinput", "Microphone"),
        cameras: of("videoinput", "Camera"),
        speakers: of("audiooutput", "Speaker"),
        micId: settings(this.stream?.getAudioTracks()[0]),
        cameraId: settings(this.stream?.getVideoTracks()[0]),
      });
    } catch {
      /* device list not available in this browser */
    }
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
        // NotReadable / Abort = the camera exists but is in use; anything else = no camera on this device.
        this.set({ cameraProblem: err instanceof Error && /NotReadable|Abort|TrackStart/.test(err.name) ? "busy" : "missing" });
        try {
          // No usable camera: carry on with sound only.
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err2) {
          // No microphone either. The rep can still watch and listen; a customer needs at least a microphone.
          if (denied(err2) || this.opts.role !== "rep") throw err2;
          this.stream = new MediaStream();
        }
      }
      const cam = this.stream.getVideoTracks()[0];
      const caps = (cam?.getCapabilities?.() ?? {}) as { torch?: boolean };
      this.set({ local: this.stream, hasCamera: Boolean(cam), hasMic: this.stream.getAudioTracks().length > 0, cameraOff: !cam, torch: caps.torch ? "off" : "unsupported" });
      void this.refreshDevices();
      if (this.opts.role === "customer") this.watchCamera();
      navigator.mediaDevices.addEventListener?.("devicechange", this.refreshDevices);
      // Coming back to the page after switching apps: restart the camera if the phone stopped it.
      document.addEventListener("visibilitychange", this.onVisible);
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

  private onVisible = () => {
    if (document.visibilityState === "visible" && this.opts.role === "customer") void this.ensureCamera();
  };

  /** Rep: drop the connection and set it up again. Fixes a frozen or missing picture without ending the call. */
  reconnect = () => {
    if (this.alive && this.opts.role === "rep") void this.offer();
  };

  hangUp = () => {
    if (!this.alive) return;
    this.alive = false;
    void this.send("bye");
    this.closePeer();
    this.screen?.stop();
    this.screen = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    navigator.mediaDevices.removeEventListener?.("devicechange", this.refreshDevices);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.set({ status: "ended", local: null, sharing: false, locationAsked: false });
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
    if (this.opts.role === "rep") this.tellVideo();
  };

  /** Swap one of this device's own tracks for a new one, in the call and in the local preview. */
  private async swapTrack(kind: "audio" | "video", track: MediaStreamTrack, sendIt: boolean) {
    const old = kind === "audio" ? this.stream?.getAudioTracks()[0] : this.stream?.getVideoTracks()[0];
    if (sendIt) await (this.sender(kind) ?? this.pc?.getSenders().find((s) => s.track === old))?.replaceTrack(track);
    if (old) {
      this.stream?.removeTrack(old);
      old.stop();
    }
    this.stream ??= new MediaStream();
    this.stream.addTrack(track);
    this.set({ local: new MediaStream(this.stream.getTracks()) });
  }

  /** Switch between the back and front camera without dropping the call. */
  flipCamera = async () => {
    const next: Facing = this.state.facing === "environment" ? "user" : "environment";
    try {
      // Phones can't open both cameras at once, so release the current one first.
      this.stream?.getVideoTracks()[0]?.stop();
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: next }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      const track = fresh.getVideoTracks()[0];
      await this.swapTrack("video", track, true);
      const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
      this.set({ facing: next, cameraOff: false, hasCamera: true, torch: caps.torch ? "off" : "unsupported" });
      this.watchCamera();
      void this.preferSharpness();
      this.tellCaps();
    } catch {
      /* this device has only one camera */
    }
  };

  pickMic = async (id: string) => {
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: id } } });
      const track = fresh.getAudioTracks()[0];
      track.enabled = !this.state.muted;
      await this.swapTrack("audio", track, true);
      this.set({ hasMic: true, micId: id });
      void this.refreshDevices();
    } catch {
      this.set({ error: "That microphone couldn't be opened." });
    }
  };

  pickCamera = async (id: string) => {
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      // While the screen is being shared, keep sending the screen; the new camera takes over when sharing stops.
      await this.swapTrack("video", fresh.getVideoTracks()[0], !this.screen);
      this.set({ hasCamera: true, cameraOff: false, cameraId: id, cameraProblem: "" });
      if (this.opts.role === "rep") this.tellVideo();
      void this.refreshDevices();
    } catch {
      this.set({ error: "That camera couldn't be opened." });
    }
  };

  pickSpeaker = (id: string) => this.set({ speakerId: id });

  /** Show this computer's screen to the customer in place of the camera. */
  startShare = async () => {
    if (this.screen || !navigator.mediaDevices?.getDisplayMedia) return;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      this.screen = display.getVideoTracks()[0];
      // The browser's own "Stop sharing" button ends it too.
      this.screen.onended = () => void this.stopShare();
      await this.sender("video")?.replaceTrack(this.screen);
      this.set({ sharing: true });
      this.tellVideo();
    } catch {
      /* the person cancelled the screen picker */
    }
  };

  stopShare = async () => {
    if (!this.screen) return;
    this.screen.onended = null;
    this.screen.stop();
    this.screen = null;
    await this.sender("video")?.replaceTrack(this.stream?.getVideoTracks()[0] ?? null).catch(() => undefined);
    this.set({ sharing: false });
    this.tellVideo();
  };

  /** Rep: mark a spot on the customer's picture so they know where to aim. */
  point = (x: number, y: number) => {
    this.set({ pointer: { x, y, at: Date.now() } });
    this.control({ t: "point", x, y });
  };

  /** Rep: set the customer's real camera zoom. */
  zoomRemote = (value: number) => {
    if (!this.state.remoteZoom) return;
    this.set({ remoteZoom: { ...this.state.remoteZoom, value } });
    this.control({ t: "zoom", value });
  };

  /**
   * Rep: ask the customer's phone for a full-quality still. Resolves true once
   * the phone has uploaded it, or false if it can't or doesn't answer in time.
   */
  requestPhoto = () =>
    new Promise<boolean>((resolve) => {
      if (this.dc?.readyState !== "open") return resolve(false);
      this.photoWaiter = resolve;
      this.control({ t: "snap" });
      setTimeout(() => {
        if (this.photoWaiter === resolve) {
          this.photoWaiter = null;
          resolve(false);
        }
      }, 8000);
    });

  /** Customer: report whether the still was sent. */
  photoDone = (ok: boolean) => this.control({ t: "photo", ok });

  /** Rep: ask the customer to share where they are. They choose whether to. */
  requestLocation = () => {
    this.set({ location: "asked" });
    this.control({ t: "locate" });
  };

  /** Customer: reply to that request. */
  answerLocation = (shared: Shared | null) => {
    this.set({ locationAsked: false });
    this.control(shared ? { t: "location", ...shared } : { t: "location", declined: true });
  };

  /** Customer: phone flashlight, on phones and browsers that allow it. */
  toggleTorch = async () => {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || this.state.torch === "unsupported") return;
    const on = this.state.torch !== "on";
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      this.set({ torch: on ? "on" : "off" });
    } catch {
      this.set({ torch: "unsupported" });
    }
  };

  /** Called when the page is left. */
  dispose = () => {
    if (this.alive) void this.send("bye");
    this.alive = false;
    this.pc?.close();
    this.screen?.stop();
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
  return {
    ...state,
    start: engine.start, hangUp: engine.hangUp, toggleMute: engine.toggleMute, toggleCamera: engine.toggleCamera, flipCamera: engine.flipCamera,
    pickMic: engine.pickMic, pickCamera: engine.pickCamera, pickSpeaker: engine.pickSpeaker, startShare: engine.startShare, stopShare: engine.stopShare,
    reconnect: engine.reconnect, point: engine.point, zoomRemote: engine.zoomRemote, requestPhoto: engine.requestPhoto, photoDone: engine.photoDone, requestLocation: engine.requestLocation, answerLocation: engine.answerLocation, toggleTorch: engine.toggleTorch,
  };
}
