"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { Job } from "@/lib/types";

const TERMINAL = new Set(["completed", "failed", "canceled"]);

export function JobView({ initialJob }: { initialJob: Job }) {
  const [job, setJob] = useState(initialJob);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    if (TERMINAL.has(job.status)) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
      if (res.ok) setJob((await res.json()).job);
    }, 2000);
    return () => clearInterval(timer);
  }, [job.id, job.status]);

  async function cancel() {
    setCanceling(true);
    const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
    if (res.ok) setJob((await res.json()).job);
    setCanceling(false);
  }

  const videoSrc = job.outputFileId ? `/api/files/${job.outputFileId}` : job.outputUrl;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <StatusBadge status={job.status} />
        <span className="text-sm text-muted">
          {job.provider} · {job.mode}
        </span>
        {!TERMINAL.has(job.status) && (
          <button onClick={cancel} disabled={canceling} className="ml-auto text-sm text-red-300 hover:underline">
            Cancel
          </button>
        )}
      </div>

      {!TERMINAL.has(job.status) && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded bg-panel">
            <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(job.progress * 100)}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted">Rendering usually takes a few minutes. You can leave this page; the job continues.</p>
        </div>
      )}

      {job.status === "completed" && videoSrc && (
        <div className="space-y-2">
          <video src={videoSrc} controls autoPlay className="w-full rounded-lg border border-border" />
          <a href={videoSrc} download className="inline-block text-sm text-accent hover:underline">
            Download
          </a>
        </div>
      )}

      {job.status === "failed" && <p className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">{job.error}</p>}

      <section>
        <h2 className="text-sm font-medium text-muted">Timeline</h2>
        <ol className="mt-2 space-y-1 text-sm">
          {job.events.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-20 shrink-0 text-xs text-muted">{new Date(e.at).toLocaleTimeString()}</span>
              <span>{e.message}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
