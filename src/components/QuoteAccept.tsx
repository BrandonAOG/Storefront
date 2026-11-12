"use client";

import { useState, useTransition } from "react";
import { acceptQuote } from "@/app/actions";
import { money } from "@/lib/format";

type Item = { id: number; name: string; description: string; priceCents: number; qty: number; optional: boolean };

export function QuoteAccept({ token, items, depositPercent, payOnline, canAccept }: { token: string; items: Item[]; depositPercent: number; payOnline: boolean; canAccept: boolean }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const total = items.filter((i) => !i.optional || picked.has(i.id)).reduce((sum, i) => sum + i.priceCents * i.qty, 0);
  const dueNow = payOnline ? Math.round((total * depositPercent) / 100) : 0;
  const required = items.filter((i) => !i.optional);
  const optional = items.filter((i) => i.optional);

  const row = (i: Item, control?: React.ReactNode) => (
    <li key={i.id} className="flex items-start justify-between gap-3 py-3">
      <label className="flex items-start gap-3">
        {control}
        <div>
          <p className="font-semibold">{i.qty > 1 ? `${i.qty} × ` : ""}{i.name}</p>
          {i.description && <p className="whitespace-pre-line text-sm text-slate-600">{i.description}</p>}
        </div>
      </label>
      <p className="shrink-0 font-semibold">{money(i.priceCents * i.qty)}</p>
    </li>
  );

  return (
    <div>
      <ul className="divide-y divide-slate-100 border-y border-slate-200">{required.map((i) => row(i))}</ul>
      {optional.length > 0 && (
        <>
          <h2 className="mt-6 font-bold">Optional add-ons</h2>
          <ul className="divide-y divide-slate-100 border-y border-slate-200">
            {optional.map((i) =>
              row(
                i,
                <input
                  type="checkbox"
                  className="mt-0.5"
                  aria-label={`Include ${i.name}`}
                  disabled={!canAccept}
                  checked={picked.has(i.id)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(i.id);
                    else next.delete(i.id);
                    setPicked(next);
                  }}
                />,
              ),
            )}
          </ul>
        </>
      )}
      <p className="mt-4 flex justify-between text-lg font-bold"><span>Total</span><span>{money(total)}</span></p>
      {payOnline && dueNow > 0 && dueNow < total && <p className="flex justify-between text-sm text-slate-600"><span>Deposit due on acceptance ({depositPercent}%)</span><span>{money(dueNow)}</span></p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {canAccept && (
        <button
          type="button"
          className="btn btn-primary mt-5 w-full py-3 text-base"
          disabled={pending}
          onClick={() => {
            setError("");
            startTransition(async () => {
              const res = await acceptQuote(token, [...picked]);
              if (res.ok) window.location.assign(res.url);
              else setError(res.error);
            });
          }}
        >
          {pending ? "Working…" : payOnline && dueNow > 0 ? `Accept and pay ${money(dueNow)}` : "Accept estimate"}
        </button>
      )}
    </div>
  );
}
