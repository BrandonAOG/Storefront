"use client";

import { useState, useTransition } from "react";
import { createVisit } from "@/app/actions";
import { Field, Honeypot } from "./ContactFields";

const empty = { name: "", email: "", phone: "", address: "", zip: "", topic: "", details: "", preferredDay: "", preferredTime: "" };

export function VisitForm({ topics, initialTopic, minDay }: { topics: string[]; initialTopic: string; minDay: string }) {
  const [v, setV] = useState({ ...empty, topic: initialTopic });
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  if (done) {
    return (
      <div className="card">
        <h2 className="text-2xl font-bold">Request received</h2>
        <p className="mt-2 text-slate-600">Thanks, {v.name.split(" ")[0]}. We&apos;ll contact you to confirm a time and send the link for your virtual visit.</p>
      </div>
    );
  }

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        startTransition(async () => {
          const res = await createVisit({ ...v, website: honeypot });
          if (res.ok) setDone(true);
          else setError(res.error);
        });
      }}
    >
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
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
        <Field label="Preferred day (optional)"><input className="input" type="date" min={minDay} value={v.preferredDay} onChange={set("preferredDay")} /></Field>
        <Field label="Preferred time (optional)">
          <select className="input" value={v.preferredTime} onChange={set("preferredTime")}>
            <option value="">No preference</option>
            <option>Morning</option>
            <option>Afternoon</option>
            <option>Evening</option>
          </select>
        </Field>
        <Field label="Tell us about the project" className="sm:col-span-2">
          <textarea className="input" rows={4} maxLength={2000} value={v.details} onChange={set("details")} placeholder="Home size, fuel type (natural gas or propane), what you want to keep running in an outage…" />
        </Field>
      </div>
      <Honeypot value={honeypot} onChange={setHoneypot} />
      <button type="submit" className="btn btn-primary mt-5 w-full py-3 text-base" disabled={pending}>{pending ? "Sending…" : "Request a virtual visit"}</button>
    </form>
  );
}
