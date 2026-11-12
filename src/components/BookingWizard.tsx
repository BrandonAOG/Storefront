"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createOrder } from "@/app/actions";
import { fmtDay, fmtWindow, money } from "@/lib/format";
import { useCart } from "./Cart";
import { ContactFields, emptyContact, Field, Honeypot, SmsConsent, type Contact } from "./ContactFields";
import { track } from "./Tracker";

type ServiceLite = { id: number; name: string; summary: string; priceCents: number; zips: string[] };
type DaySlots = { day: string; slots: { startMin: number; endMin: number; available: boolean }[] };
type Props = { services: ServiceLite[]; serviceZips: string[]; depositPercent: number; payOnline: boolean };

const STEPS = ["Your booking", "Your details", "Arrival window", "Review"];

export function BookingWizard({ services, serviceZips, depositPercent, payOnline }: Props) {
  const cart = useCart();
  const [step, setStep] = useState(0);
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [notes, setNotes] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [days, setDays] = useState<DaySlots[] | null>(null);
  const [day, setDay] = useState("");
  const [startMin, setStartMin] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const lines = cart.lines.filter((l) => byId.has(l.serviceId)).map((l) => ({ ...l, service: byId.get(l.serviceId)! }));
  const subtotal = lines.reduce((sum, l) => sum + l.service.priceCents * l.qty, 0);
  const dueNow = payOnline ? Math.round((subtotal * depositPercent) / 100) : 0;

  // Count "started checkout" once per page load, when there is something to book.
  const started = useRef(false);
  const hasLines = cart.ready && lines.length > 0;
  useEffect(() => {
    if (hasLines && !started.current) {
      started.current = true;
      track("checkout_start");
    }
  }, [hasLines]);

  const loadSlots = () => {
    setDays(null);
    fetch(`/api/slots?services=${lines.map((l) => l.serviceId).join(",")}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { days: DaySlots[] }) => {
        setDays(d.days);
        setDay((cur) => (d.days.some((x) => x.day === cur) ? cur : (d.days.find((x) => x.slots.some((s) => s.available))?.day ?? "")));
      })
      .catch(() => setDays([]));
  };
  const goToSlots = () => {
    setStep(2);
    loadSlots();
  };

  if (!cart.ready) return <p className="text-slate-500">Loading…</p>;

  if (lines.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-lg font-semibold">Nothing in your booking yet</p>
        <p className="mt-1 text-sm text-slate-600">Add a service to get started.</p>
        <Link href="/#services" className="btn btn-primary mt-4">Browse services</Link>
      </div>
    );
  }

  const zip5 = contact.zip.trim().slice(0, 5);
  const zipOk = /^\d{5}$/.test(zip5);
  const zipBlocked = serviceZips.length > 0 && zipOk && !serviceZips.includes(zip5);
  const limited = zipOk ? lines.find((l) => l.service.zips.length > 0 && !l.service.zips.includes(zip5)) : undefined;
  const slot = days?.find((d) => d.day === day)?.slots.find((s) => s.startMin === startMin);

  const submit = () => {
    if (startMin === null) return;
    setError("");
    startTransition(async () => {
      const res = await createOrder({
        ...contact,
        smsConsent,
        notes,
        day,
        startMin,
        items: lines.map((l) => ({ serviceId: l.serviceId, qty: l.qty })),
        website: honeypot,
      });
      if (res.ok) {
        cart.clear();
        window.location.assign(res.url);
      } else {
        setError(res.error);
        if (/time/i.test(res.error)) {
          setStartMin(null);
          goToSlots();
        }
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <ol className="mb-6 flex flex-wrap gap-2 text-xs font-semibold">
          {STEPS.map((label, i) => (
            <li key={label} className={`rounded-full px-3 py-1 ${i === step ? "bg-slate-900 text-white" : i < step ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-500"}`}>
              {i + 1}. {label}
            </li>
          ))}
        </ol>

        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        {step === 0 && (
          <div className="card">
            <h2 className="text-xl font-bold">Your booking</h2>
            <ul className="mt-4 divide-y divide-slate-100">
              {lines.map((l) => (
                <li key={l.serviceId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{l.service.name}</p>
                    <p className="text-sm text-slate-500">{money(l.service.priceCents)} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn btn-ghost px-3 py-1" aria-label={`Remove one ${l.service.name}`} onClick={() => cart.setQty(l.serviceId, l.qty - 1)}>−</button>
                    <span className="w-6 text-center font-semibold">{l.qty}</span>
                    <button type="button" className="btn btn-ghost px-3 py-1" aria-label={`Add one ${l.service.name}`} onClick={() => cart.setQty(l.serviceId, l.qty + 1)}>+</button>
                    <span className="w-20 text-right font-semibold">{money(l.service.priceCents * l.qty)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between gap-3">
              <Link href="/#services" className="btn btn-ghost">Add another service</Link>
              <button type="button" className="btn btn-primary" onClick={() => setStep(1)}>Continue</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              if (!zipBlocked && !limited) goToSlots();
            }}
          >
            <h2 className="text-xl font-bold">Your details</h2>
            <div className="mt-4"><ContactFields value={contact} onChange={setContact} /></div>
            {zipBlocked && <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Sorry, ZIP code {zip5} is outside our online booking area. Please call us and we&apos;ll see what we can do.</p>}
            {!zipBlocked && limited && <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Sorry, &quot;{limited.service.name}&quot; isn&apos;t offered in ZIP code {zip5}. Go back and remove it, or call us.</p>}
            <SmsConsent checked={smsConsent} onChange={setSmsConsent} />
            <Field label="Anything we should know? (optional)" className="mt-4">
              <textarea className="input" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Generator brand and model, gate code, pets…" />
            </Field>
            <Honeypot value={honeypot} onChange={setHoneypot} />
            <div className="mt-4 flex justify-between gap-3">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
              <button type="submit" className="btn btn-primary" disabled={zipBlocked || Boolean(limited)}>Continue</button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="card">
            <h2 className="text-xl font-bold">Choose an arrival window</h2>
            <p className="mt-1 text-sm text-slate-600">Your technician arrives during the window you pick.</p>
            {days === null && <p className="mt-4 text-slate-500">Loading available times…</p>}
            {days?.length === 0 && (
              <p className="mt-4 text-slate-600">No times are open online right now. Please call us to schedule. <button type="button" className="underline" onClick={loadSlots}>Try again</button></p>
            )}
            {days && days.length > 0 && (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  {days.map((d) => {
                    const open = d.slots.some((s) => s.available);
                    return (
                      <button
                        key={d.day}
                        type="button"
                        disabled={!open}
                        onClick={() => { setDay(d.day); setStartMin(null); }}
                        className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold ${d.day === day ? "border-slate-900 bg-slate-900 text-white" : open ? "border-slate-300 bg-white hover:border-slate-500" : "border-slate-200 bg-slate-100 text-slate-400 line-through"}`}
                      >
                        {fmtDay(d.day)}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {days.find((d) => d.day === day)?.slots.map((s) => (
                    <button
                      key={s.startMin}
                      type="button"
                      disabled={!s.available}
                      onClick={() => setStartMin(s.startMin)}
                      className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold ${s.startMin === startMin ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200" : s.available ? "border-slate-300 bg-white hover:border-slate-500" : "border-slate-200 bg-slate-100 text-slate-400"}`}
                    >
                      {fmtWindow(s.startMin, s.endMin)}
                      {!s.available && <span className="ml-2 font-normal">Full</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="mt-5 flex justify-between gap-3">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
              <button type="button" className="btn btn-primary" disabled={!slot} onClick={() => setStep(3)}>Continue</button>
            </div>
          </div>
        )}

        {step === 3 && slot && (
          <div className="card">
            <h2 className="text-xl font-bold">Review and confirm</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold text-slate-500">When</dt><dd>{fmtDay(day, true)}<br />{fmtWindow(slot.startMin, slot.endMin)}</dd></div>
              <div><dt className="font-semibold text-slate-500">Where</dt><dd>{contact.address}<br />{contact.city} {contact.zip}</dd></div>
              <div><dt className="font-semibold text-slate-500">Contact</dt><dd>{contact.name}<br />{contact.phone}<br />{contact.email}</dd></div>
              {notes && <div><dt className="font-semibold text-slate-500">Notes</dt><dd className="whitespace-pre-line">{notes}</dd></div>}
            </dl>
            <p className="mt-5 text-sm text-slate-600">
              {payOnline
                ? depositPercent < 100
                  ? `You'll pay a ${depositPercent}% deposit (${money(dueNow)}) now on our secure payment page. The balance is due when the work is done.`
                  : `You'll pay ${money(dueNow)} now on our secure payment page.`
                : "No payment is taken online. You'll pay when the work is done."}
            </p>
            <div className="mt-5 flex justify-between gap-3">
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setStep(2)}>Back</button>
              <button type="button" className="btn btn-primary px-6" disabled={pending} onClick={submit}>
                {pending ? "Working…" : payOnline ? `Pay ${money(dueNow)} & book` : "Confirm booking"}
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="card h-fit">
        <h2 className="font-bold">Summary</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.serviceId} className="flex justify-between gap-3">
              <span>{l.qty} × {l.service.name}</span>
              <span className="font-semibold">{money(l.service.priceCents * l.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-bold"><span>Total</span><span>{money(subtotal)}</span></div>
        {payOnline && depositPercent < 100 && <div className="mt-1 flex justify-between text-sm text-slate-600"><span>Due today</span><span>{money(dueNow)}</span></div>}
        {slot && <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm"><strong>{fmtDay(day)}</strong><br />{fmtWindow(slot.startMin, slot.endMin)}</p>}
      </aside>
    </div>
  );
}
