import { listTemplates } from "@/lib/templates";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listTemplates();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="mt-1 text-sm text-muted">
          A template is a licensed clip of one performer. Place the file at <code>public/templates/&lt;id&gt;.mp4</code> to activate it.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {templates.map((t) => (
          <li key={t.id} className="rounded-lg border border-border bg-panel p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.name}</span>
              <span className={`text-xs ${t.drivingVideoUrl ? "text-emerald-300" : "text-amber-300"}`}>
                {t.drivingVideoUrl ? "ready" : "clip missing"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">{t.description}</p>
            <p className="mt-2 text-xs text-muted">
              {t.category} · {t.durationSec}s · <code>{t.id}.mp4</code>
            </p>
            {t.drivingVideoUrl && (
              <video src={t.drivingVideoUrl} controls muted className="mt-3 w-full rounded" preload="metadata" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
