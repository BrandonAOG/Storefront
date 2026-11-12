"use client";

import { useState, useTransition } from "react";
import { submitFeedback } from "@/app/actions";

export function FeedbackForm({ token, reviewUrl }: { token: string; reviewUrl: string }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Thank you!</h1>
        {score !== null && score >= 9 && reviewUrl ? (
          <>
            <p className="mt-2 text-slate-600">We&apos;re glad it went well. Would you share that in a quick public review? It helps other homeowners find us.</p>
            <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-5">Leave a review ↗</a>
          </>
        ) : (
          <p className="mt-2 text-slate-600">Your feedback goes straight to our team.</p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (score === null) return setError("Please choose a score.");
        setError("");
        startTransition(async () => {
          const res = await submitFeedback(token, score, comment);
          if (res.ok) setDone(true);
          else setError(res.error ?? "Please try again.");
        });
      }}
    >
      <h1 className="text-3xl font-bold tracking-tight">How did we do?</h1>
      <p className="mt-2 text-slate-600">How likely are you to recommend us to a friend or neighbor?</p>
      <div className="mt-5 grid grid-cols-6 gap-2 sm:grid-cols-11 sm:gap-1" role="radiogroup" aria-label="Score from 0 to 10">
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" role="radio" aria-checked={score === n} onClick={() => setScore(n)} className={`min-h-11 rounded-lg border py-2 text-base font-semibold ${score === n ? "border-ink bg-ink text-white" : "border-slate-300 bg-white hover:border-slate-500"}`}>
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500"><span>Not likely</span><span>Very likely</span></div>
      <label className="mt-5 block">
        <span className="label">Anything you&apos;d like to tell us? (optional)</span>
        <textarea className="input" rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <button className="btn btn-primary mt-4 w-full py-3 text-base" disabled={pending}>{pending ? "Sending…" : "Send feedback"}</button>
    </form>
  );
}
