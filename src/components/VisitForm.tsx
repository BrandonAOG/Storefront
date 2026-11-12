"use client";

import { useState, useTransition } from "react";
import { createVisit } from "@/app/actions";
import { Field, Honeypot, SmsConsent } from "./ContactFields";

const empty = { name: "", email: "", phone: "", address: "", zip: "", topic: "", details: "", preferredDay: "", preferredTime: "" };

export function VisitForm({ topics, initialTopic, minDay, uploads }: { topics: string[]; initialTopic: string; minDay: string; uploads: boolean }) {
  const [v, setV] = useState({ ...empty, topic: initialTopic });
  const [mode, setMode] = useState<"live" | "async">("live");
  const [smsConsent, setSmsConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        startTransition(async () => {
          const res = await createVisit({ ...v, mode, smsConsent, website: honeypot });
          if (res.ok) window.location.assign(res.url);
          else setError(res.error);
        });
      }}
    >
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {uploads && (
        <fieldset className="mb-5 grid gap-2 sm:grid-cols-2">
          <legend className="label">How would you like to do it?</legend>
          {([["live", "Live call", "We schedule a video or phone call with you."], ["async", "Send a video", "Record your site on your phone and we reply with an estimate."]] as const).map(([value, title, text]) => (
            <label key={value} className={`cursor-pointer rounded-xl border p-3 text-sm ${mode === value ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200" : "border-slate-300"}`}>
              <input type="radio" name="mode" className="sr-only" checked={mode === value} onChange={() => setMode(value)} />
              <span className="block font-semibold">{title}</span>
              <span className="text-slate-600">{text}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><input className="input" required autoComplete="name" maxLength={120} value={v.name} onChange={set("name")} /></Field>
        <Field label="Phone"><input className="input" required type="tel" autoComplete="tel" maxLength={30} value={v.phone} onChange={set("phone")} /></Field>
        <Field label="Email" className="sm:col-span-2"><input className="input" required type="email" autoComplete="email" maxLength={200} value={v.email} onChange={set("email")} /></Field>
        <Field label="Property address (optional)"><input className="input" autoComplete="street-address" maxLength={200} value={v.address} onChange={set("address")} /></Field>
        <Field label="ZIP code (optional)"><input className="input" inputMode="numeric" autoComplete="postal-code" maxLength={10} value={v.zip} onChange={set("zip")} /></Field>
        <Field label="What is this about?" className="sm:col-span-2">
          <select className="input" value={v.topic} onChange={set("topic")}>
            <option value="">Choose one…</option>
            {topics.map((t) => <option key={t}>{t}</option>)}
            <option>Something else</option>
          </select>
        </Field>
        {mode === "live" && (
          <>
            <Field label="Preferred day (optional)"><input className="input" type="date" min={minDay} value={v.preferredDay} onChange={set("preferredDay")} /></Field>
            <Field label="Preferred time (optional)">
              <select className="input" value={v.preferredTime} onChange={set("preferredTime")}>
                <option value="">No preference</option>
                <option>Morning</option>
                <option>Afternoon</option>
                <option>Evening</option>
              </select>
            </Field>
          </>
        )}
        <Field label="Tell us about the project" className="sm:col-span-2">
          <textarea className="input" rows={4} maxLength={2000} value={v.details} onChange={set("details")} placeholder="Home size, fuel type (natural gas or propane), what you want to keep running in an outage…" />
        </Field>
      </div>
      <SmsConsent checked={smsConsent} onChange={setSmsConsent} />
      <Honeypot value={honeypot} onChange={setHoneypot} />
      <button type="submit" className="btn btn-primary mt-5 w-full py-3 text-base" disabled={pending}>
        {pending ? "Sending…" : mode === "async" ? "Continue to upload" : "Request a virtual visit"}
      </button>
    </form>
  );
}
