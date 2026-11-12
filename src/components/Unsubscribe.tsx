"use client";

import { useState, useTransition } from "react";
import { setEmailOptOut } from "@/app/actions";

export function Unsubscribe({ token, initial }: { token: string; initial: boolean }) {
  const [out, setOut] = useState(initial);
  const [pending, startTransition] = useTransition();
  const toggle = (next: boolean) => startTransition(async () => { if ((await setEmailOptOut(token, next)).ok) setOut(next); });
  return out ? (
    <>
      <h1 className="text-3xl font-bold tracking-tight">You&apos;re unsubscribed</h1>
      <p className="mt-2 text-slate-600">We won&apos;t send you reminders or offers. You&apos;ll still get confirmations for bookings you make.</p>
      <button className="btn btn-ghost mt-5" disabled={pending} onClick={() => toggle(false)}>Undo</button>
    </>
  ) : (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Unsubscribe?</h1>
      <p className="mt-2 text-slate-600">Stop service reminders and offers by email and text. You&apos;ll still get confirmations for bookings you make.</p>
      <button className="btn btn-dark mt-5" disabled={pending} onClick={() => toggle(true)}>Unsubscribe</button>
    </>
  );
}
