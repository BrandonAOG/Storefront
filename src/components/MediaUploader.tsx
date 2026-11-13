"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { attachVisitMedia } from "@/app/actions";

const MAX_BYTES = 250 * 1024 * 1024;

/** Sends photos and videos straight from the browser to file storage. */
export function MediaUploader({ token, remaining, survey = false }: { token: string; remaining: number; survey?: boolean }) {
  const router = useRouter();
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState("");

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    const list = [...files].slice(0, remaining);
    for (const [i, file] of list.entries()) {
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" is larger than 250 MB. Try a shorter video.`);
        continue;
      }
      try {
        const safeName = file.name.replace(/[^\w.-]/g, "_").slice(-80);
        const blob = await upload(`visits/${safeName}`, file, {
          access: "public",
          handleUploadUrl: "/api/visit-upload",
          clientPayload: token,
          multipart: file.size > 20 * 1024 * 1024,
          onUploadProgress: (p) => setProgress(`Uploading ${i + 1} of ${list.length}: ${Math.round(p.percentage)}%`),
        });
        const saved = await attachVisitMedia(token, { url: blob.url, name: file.name.slice(0, 200), contentType: file.type, size: file.size, survey });
        if (!saved.ok) setError(saved.error ?? "That file couldn't be saved.");
      } catch {
        setError(`"${file.name}" couldn't be uploaded. Check the file type and try again.`);
      }
    }
    setProgress("");
    router.refresh();
  };

  if (remaining <= 0) return survey ? null : <p className="text-sm text-slate-600">You&apos;ve added the maximum number of files.</p>;
  if (survey) {
    return (
      <div>
        <label className="btn btn-dark cursor-pointer">
          Add your survey or site plan
          <input type="file" className="sr-only" multiple accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" disabled={Boolean(progress)} onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
        </label>
        {progress && <p role="status" className="mt-2 text-sm text-slate-600">{progress}</p>}
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        <p className="mt-2 text-xs text-slate-500">A photo of the paper copy or a PDF. Lay it flat in good light so the numbers can be read.</p>
      </div>
    );
  }
  return (
    <div>
      <label className="btn btn-primary cursor-pointer">
        Add photos or video
        <input type="file" className="sr-only" multiple accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm" disabled={Boolean(progress)} onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
      </label>
      {progress && <p role="status" className="mt-2 text-sm text-slate-600">{progress}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <p className="mt-2 text-xs text-slate-500">Photos (JPG, PNG, HEIC) or video (MP4, MOV), up to 250 MB each.</p>
    </div>
  );
}
