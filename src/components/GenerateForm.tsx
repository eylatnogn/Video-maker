"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GenerationMode, Persona, Template } from "@/lib/types";

type Source = { kind: "template"; templateId: string } | { kind: "upload" };

export function GenerateForm({
  personas,
  templates,
  initialPersonaId,
}: {
  personas: Persona[];
  templates: Template[];
  initialPersonaId?: string;
}) {
  const router = useRouter();
  const available = templates.filter((t) => t.drivingVideoUrl);
  const [personaId, setPersonaId] = useState(initialPersonaId ?? personas[0]?.id ?? "");
  const [source, setSource] = useState<Source>(
    available[0] ? { kind: "template", templateId: available[0].id } : { kind: "upload" },
  );
  const [video, setVideo] = useState<File | null>(null);
  const [mode, setMode] = useState<GenerationMode>("replace");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let drivingVideoFileId: string | undefined;
      let templateId: string | undefined;
      if (source.kind === "upload") {
        if (!video) throw new Error("Choose a video to copy the motion from");
        const form = new FormData();
        form.set("video", video);
        const up = await fetch("/api/uploads", { method: "POST", body: form });
        const upBody = await up.json();
        if (!up.ok) throw new Error(upBody.error ?? "Upload failed");
        drivingVideoFileId = upBody.file.id;
      } else {
        templateId = source.templateId;
      }
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId, templateId, drivingVideoFileId, mode, prompt: prompt || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not start render");
      router.push(`/jobs/${body.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (personas.length === 0) {
    return <p className="text-sm text-muted">Create a persona first.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <fieldset>
        <legend className="text-sm font-medium">Who</legend>
        <ul className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {personas.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPersonaId(p.id)}
                className={`block w-full overflow-hidden rounded-lg border-2 ${personaId === p.id ? "border-accent" : "border-transparent hover:border-border"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${p.primaryPhotoId}`} alt={p.name} className="aspect-square w-full object-cover" />
                <span className="block truncate px-1 py-1 text-xs">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">What you do</legend>
        {available.length === 0 && (
          <p className="mt-2 text-xs text-amber-300">
            No template clips are installed (see README). Upload your own driving video below.
          </p>
        )}
        <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {available.map((t) => {
            const selected = source.kind === "template" && source.templateId === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSource({ kind: "template", templateId: t.id })}
                  className={`w-full rounded-lg border p-3 text-left ${selected ? "border-accent bg-panel" : "border-border hover:bg-panel"}`}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs uppercase text-muted">{t.category}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {t.description} · {t.durationSec}s
                  </p>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setSource({ kind: "upload" })}
              className={`w-full rounded-lg border p-3 text-left ${source.kind === "upload" ? "border-accent bg-panel" : "border-border hover:bg-panel"}`}
            >
              <div className="text-sm font-medium">Upload my own clip</div>
              <p className="mt-1 text-xs text-muted">Any video of one person singing, dancing or talking. You copy its motion and audio.</p>
            </button>
          </li>
        </ul>
        {source.kind === "upload" && (
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
            className="mt-3 block w-full text-sm"
          />
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Options</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
            Replace the person in the clip (keeps background)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "animate"} onChange={() => setMode("animate")} />
            Animate my photo (new scene)
          </label>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Optional style prompt, e.g. 'neon stage, cinematic lighting'"
          className="w-full rounded border border-border bg-panel px-3 py-2 text-sm"
        />
      </fieldset>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button type="submit" disabled={busy || !personaId} className="rounded bg-accent px-4 py-2 font-medium text-white disabled:opacity-40">
        {busy ? "Starting…" : "Generate video"}
      </button>
    </form>
  );
}
