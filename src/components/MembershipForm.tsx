"use client";

import { useState, useTransition } from "react";
import { createMembership } from "@/app/actions";
import { ContactFields, emptyContact, Field, Honeypot, SmsConsent, type Contact } from "./ContactFields";

export function MembershipForm({ planId, payOnline, cta }: { planId: number; payOnline: boolean; cta: string }) {
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [generator, setGenerator] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        startTransition(async () => {
          const res = await createMembership({ ...contact, smsConsent, planId, generator, website: honeypot });
          if (res.ok) window.location.assign(res.url);
          else setError(res.error);
        });
      }}
    >
      <h2 className="text-xl font-bold">Your details</h2>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-4"><ContactFields value={contact} onChange={setContact} /></div>
      <Field label="Generator brand and model (optional)" className="mt-4">
        <input className="input" maxLength={200} value={generator} onChange={(e) => setGenerator(e.target.value)} />
      </Field>
      <SmsConsent checked={smsConsent} onChange={setSmsConsent} />
      <Honeypot value={honeypot} onChange={setHoneypot} />
      <button type="submit" className="btn btn-primary mt-5 w-full py-3 text-base" disabled={pending}>{pending ? "Working…" : cta}</button>
      <p className="mt-2 text-center text-xs text-slate-500">{payOnline ? "You'll finish on our secure payment page." : "No payment is taken online. We'll contact you with pricing and next steps."}</p>
    </form>
  );
}
