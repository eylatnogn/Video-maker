"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { uploadFile } from "@/lib/client/upload";

export function PersonaForm({ consentStatement, maxPhotos }: { consentStatement: string; maxPhotos: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const photoFileIds: string[] = [];
      for (const [i, f] of files.entries()) {
        setBusy(`Uploading photo ${i + 1} of ${files.length}…`);
        photoFileIds.push((await uploadFile(f, "image")).id);
      }
      setBusy("Creating persona…");
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, consent, photoFileIds }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not create persona");
      router.push(`/personas/${body.persona.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <label className="block">
        <span className="text-sm font-medium">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-panel px-3 py-2"
          placeholder="Me"
          required
          maxLength={60}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Photos (1 to {maxPhotos})</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, maxPhotos))}
          className="mt-1 block w-full text-sm"
          required
        />
        <span className="mt-1 block text-xs text-muted">
          The first photo is the identity reference. Use a sharp, front-facing, evenly lit shot with
          nothing covering your face. Full-body shots help dance templates.
        </span>
      </label>

      {files.length > 0 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt="" className="aspect-square w-full rounded object-cover" />
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-accent px-1 text-[10px] text-white">primary</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>{consentStatement}</span>
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={busy !== null || !consent || files.length === 0}
        className="rounded bg-accent px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {busy ?? "Create persona"}
      </button>
    </form>
  );
}
