"use client";

import { useState, useTransition } from "react";
import { deleteMedia, renameMedia } from "@/app/admin/actions";

type Props = { id: string; name: string; dark?: boolean; onRenamed: (name: string) => void; onDeleted: () => void };

/** Rename and Delete for one saved photo, video or snapshot. Delete asks once more before it happens. */
export function MediaActions({ id, name, dark = false, onRenamed, onDeleted }: Props) {
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

  if (mode === "rename") {
    return (
      <form
        className="flex flex-wrap items-center gap-1 p-1"
        onSubmit={(e) => {
          e.preventDefault();
          rename();
        }}
      >
        <input className="min-w-0 flex-1 rounded border border-slate-400 bg-white px-2 py-1 text-sm text-black" value={value} maxLength={80} autoFocus aria-label="Name" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setMode("")} />
        <button type="submit" className={link} disabled={busy || !value.trim()}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className={link} onClick={() => setMode("")}>Cancel</button>
        {error && <span role="alert" className="w-full text-xs text-red-500">{error}</span>}
      </form>
    );
  }
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
      <button type="button" className={link} onClick={() => { setValue(name); setMode("rename"); }}>Rename</button>
      <button type="button" className={link} onClick={() => setMode("delete")}>Delete</button>
    </div>
  );
}
