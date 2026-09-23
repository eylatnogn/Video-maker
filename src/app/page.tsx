import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { config } from "@/lib/config";
import { listJobs } from "@/lib/pipeline/jobs";
import { listPersonas } from "@/lib/pipeline/personas";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [personas, jobs] = await Promise.all([listPersonas(), listJobs()]);
  const cfg = config();

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-semibold">Your videos, starring you</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Upload a few photos, pick a dance or singing template, and the app swaps you into the clip
          while keeping the motion, expressions and audio.
        </p>
        {cfg.provider === "mock" && (
          <p className="mt-3 inline-block rounded border border-amber-700 bg-amber-950/40 px-3 py-1.5 text-sm text-amber-200">
            Running with the mock provider: renders finish after a short delay and return the driving clip unchanged.
            Set VIDEO_PROVIDER=fal and FAL_KEY for real output.
          </p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Personas</h2>
          <Link href="/personas/new" className="text-sm text-accent">
            Add persona
          </Link>
        </div>
        {personas.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No personas yet. Start by uploading photos of yourself.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {personas.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-lg border border-border bg-panel">
                <Link href={`/personas/${p.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${p.primaryPhotoId}`} alt={p.name} className="aspect-square w-full object-cover" />
                  <div className="p-2 text-sm">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted">{p.photoIds.length} photos</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xl font-medium">Recent renders</h2>
        {jobs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing rendered yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-panel">
            {jobs.slice(0, 20).map((j) => {
              const persona = personas.find((p) => p.id === j.personaId);
              return (
                <li key={j.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                  <StatusBadge status={j.status} />
                  <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                    {persona?.name ?? "deleted persona"} · {j.templateId ?? "custom clip"}
                  </Link>
                  <span className="ml-auto text-xs text-muted">{new Date(j.createdAt).toLocaleString()}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
