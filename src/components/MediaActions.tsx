"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { deleteMedia, renameMedia } from "@/app/admin/actions";

type Props = { id: string; name: string; /** Picture to show in the rename panel. */ url?: string; dark?: boolean; onRenamed: (name: string) => void; onDeleted: () => void };

/** Rename and Delete for one saved photo, video or snapshot. Delete asks once more before it happens. */
export function MediaActions({ id, name, url, dark = false, onRenamed, onDeleted }: Props) {
  const [mode, setMode] = useState<"" | "rename" | "delete">("");
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const [busy, go] = useTransition();
  const link = `min-h-8 px-1 text-xs font-semibold underline ${dark ? "text-slate-200" : "text-slate-700"}`;

  const rename = () => {
    const next = value.trim();
    if (!next) return;
    go(async () => {
      const r = await renameMedia(id, next);
      if (!r.ok) return setError("Couldn't save the name.");
      setError("");
      setMode("");
      onRenamed(next);
    });
  };
  const remove = () =>
    go(async () => {
      const r = await deleteMedia(id);
      if (!r.ok) return setError("Couldn't delete it.");
      onDeleted();
    });

  // Renaming opens a panel on the right side of the screen, with room to type.
  const panel =
    mode === "rename" &&
    createPortal(
      <div className="fixed inset-0 z-[100] flex justify-end bg-black/50" onClick={() => setMode("")}>
        <form
          role="dialog"
          aria-modal="true"
          aria-label="Rename"
          className="flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto bg-white p-5 text-black shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            rename();
          }}
        >
          <h2 className="text-lg font-bold">Rename</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- saved snapshot or photo */}
          {url && <img src={url} alt="" className="max-h-64 w-full rounded-lg bg-slate-100 object-contain" />}
          <label className="block text-sm font-semibold">
            Name
            <input className="mt-1 block w-full rounded-lg border border-slate-400 bg-white px-3 py-3 text-base text-black" value={value} maxLength={80} autoFocus onFocus={(e) => e.target.select()} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setMode("")} placeholder="e.g. Main panel" />
          </label>
          <p className="text-xs text-slate-600">Short names work best: Main panel, Meter can, Generator spot, Gas meter.</p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary flex-1" disabled={busy || !value.trim()}>{busy ? "Saving…" : "Save name"}</button>
            <button type="button" className="btn flex-1 border border-slate-300" onClick={() => setMode("")}>Cancel</button>
          </div>
        </form>
      </div>,
      document.body,
    );

  if (mode === "delete") {
    return (
      <div className="flex flex-wrap items-center gap-1 p-1 text-xs">
        <span>Delete for good?</span>
        <button type="button" className={`${link} !text-red-500`} disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Yes, delete"}</button>
        <button type="button" className={link} onClick={() => setMode("")}>Keep</button>
        {error && <span role="alert" className="w-full text-red-500">{error}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-1">
      {panel}
      <button type="button" className={link} onClick={() => { setValue(name); setMode("rename"); }}>Rename</button>
      <button type="button" className={link} onClick={() => setMode("delete")}>Delete</button>
    </div>
  );
}
