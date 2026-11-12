"use client";

import { useState, useTransition } from "react";
import { manageBilling } from "@/app/actions";

export function ManageBilling({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className="btn btn-dark"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const res = await manageBilling(token);
          if (res.ok) window.location.assign(res.url);
          else setError(res.error);
        })}
      >
        {pending ? "Opening…" : "Update card or cancel"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </>
  );
}
