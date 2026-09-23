import Link from "next/link";
import { notFound } from "next/navigation";
import { JobView } from "@/components/JobView";
import { getJob } from "@/lib/pipeline/jobs";
import { getPersona } from "@/lib/pipeline/personas";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const persona = await getPersona(job.personaId);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {persona ? <Link href={`/personas/${persona.id}`}>{persona.name}</Link> : "Deleted persona"} ·{" "}
          {job.templateId ?? "custom clip"}
        </h1>
        <p className="text-xs text-muted">{job.id}</p>
      </div>
      <JobView initialJob={job} />
    </div>
  );
}
