"use client";

import { useActionState } from "react";

type State = { key?: string; error?: string };

export function ApiKeyForm({ action }: { action: (prev: State, fd: FormData) => Promise<State> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div>
      <form action={formAction} className="flex flex-wrap gap-2">
        <input className="input max-w-xs" name="name" maxLength={80} required placeholder="What will use this key?" aria-label="Key name" />
        <button className="btn btn-ghost" disabled={pending}>Create key</button>
      </form>
      {state.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
      {state.key && (
        <div role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-900">Copy this key now. It won&apos;t be shown again.</p>
          <code className="mt-1 block break-all">{state.key}</code>
        </div>
      )}
    </div>
  );
}
