"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Signal } from "./useCall";

export type WatchState = {
  status: "idle" | "waiting" | "connecting" | "connected";
  /** The customer's picture and sound, plus the host's voice, passed along by the host's computer. */
  remote: MediaStream | null;
  hostName: string;
  hostLive: boolean;
};

/**
 * Watch a call a teammate is running. View only: this screen sends nothing to
 * the customer and never connects to their phone. The host's computer passes
 * the call along.
 */
class WatchEngine {
  private state: WatchState = { status: "idle", remote: null, hostName: "", hostLive: false };
  private listeners = new Set<() => void>();
  private pc: RTCPeerConnection | null = null;
  private sid = "";
  private ice: RTCIceCandidateInit[] = [];
  private cursor = 0;
  private alive = false;
  private name = "";
  private askedAt = 0;

  constructor(private opts: { signalUrl: string; clientId: string; iceServers: RTCIceServer[] }) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  private set(patch: Partial<WatchState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private send(kind: Signal["kind"], payload: NonNullable<Signal["payload"]> = {}) {
    const body = JSON.stringify({ kind, payload: { ...payload, wid: this.opts.clientId }, client: this.opts.clientId, as: "watch" });
    return fetch(this.opts.signalUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: kind === "bye" }).catch(() => undefined);
  }

  private ask() {
    this.askedAt = Date.now();
    return this.send("ready", { name: this.name });
  }

  private closePeer() {
    this.pc?.close();
    this.pc = null;
    this.ice = [];
    this.set({ remote: null });
  }

  private async handle(m: Signal) {
    const body = m.payload ?? {};
    if (body.wid !== this.opts.clientId && body.wid !== "*") return; // for another watcher
    if (m.kind === "bye") {
      this.closePeer();
      this.set({ status: "waiting" });
    } else if (m.kind === "offer" && body.sdp && body.sid) {
      this.closePeer();
      this.sid = body.sid;
      const p = new RTCPeerConnection({ iceServers: this.opts.iceServers });
      this.pc = p;
      this.set({ status: "connecting" });
      p.onicecandidate = (e) => {
        if (e.candidate) void this.send("ice", { sid: this.sid, candidate: e.candidate.toJSON() });
      };
      p.ontrack = () => {
        if (this.pc === p) this.set({ remote: new MediaStream(p.getReceivers().map((r) => r.track).filter((t) => t.readyState === "live")) });
      };
      p.onconnectionstatechange = () => {
        if (this.pc !== p) return;
        if (p.connectionState === "connected") this.set({ status: "connected" });
        else if (p.connectionState === "failed" || p.connectionState === "disconnected") {
          // The host left, reloaded or handed the call over: ask whoever is hosting now.
          this.closePeer();
          this.set({ status: "waiting" });
        }
      };
      await p.setRemoteDescription(body.sdp);
      const answer = await p.createAnswer();
      await p.setLocalDescription(answer);
      await this.send("answer", { sid: this.sid, sdp: answer });
    } else if (m.kind === "ice" && body.candidate && body.sid === this.sid) {
      this.ice.push(body.candidate);
    }
    if (this.pc?.remoteDescription) for (const c of this.ice.splice(0)) await this.pc.addIceCandidate(c).catch(() => undefined);
  }

  private poll = async () => {
    if (!this.alive) return;
    try {
      const res = await fetch(`${this.opts.signalUrl}?as=watch&client=${this.opts.clientId}&after=${this.cursor}`);
      if (res.ok) {
        const data: { cursor: number; messages: Signal[]; host: { live: boolean; name: string } } = await res.json();
        this.cursor = data.cursor;
        this.set({ hostLive: data.host.live, hostName: data.host.name });
        for (const m of data.messages) await this.handle(m).catch(() => undefined);
        // Nothing yet, or the host changed: ask (again) for the picture.
        const stuck = this.state.status === "waiting" ? 6000 : this.state.status === "connecting" ? 20_000 : Infinity;
        if (data.host.live && Date.now() - this.askedAt > stuck) void this.ask();
      }
    } catch {
      /* network blip: try again on the next tick */
    }
    if (this.alive) setTimeout(this.poll, this.state.status === "connected" ? 3000 : 1000);
  };

  /** Must be called from a button press so the browser allows sound. */
  start = async (name: string) => {
    if (this.alive) return;
    this.name = name;
    this.alive = true;
    this.set({ status: "waiting" });
    try {
      const init = await fetch(`${this.opts.signalUrl}?as=watch&client=${this.opts.clientId}&init=1`).then((r) => r.json());
      this.cursor = init.cursor;
    } catch {
      /* start from the beginning */
    }
    await this.ask();
    void this.poll();
  };

  stop = () => {
    if (!this.alive) return;
    this.alive = false;
    void this.send("bye");
    this.closePeer();
    this.set({ status: "idle" });
  };
}

export function useWatch(opts: { signalUrl: string; clientId: string; iceServers: RTCIceServer[] }) {
  const [engine] = useState(() => new WatchEngine(opts));
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
  useEffect(() => {
    window.addEventListener("pagehide", engine.stop);
    return () => {
      window.removeEventListener("pagehide", engine.stop);
      engine.stop();
    };
  }, [engine]);
  return { ...state, start: engine.start, stop: engine.stop };
}
