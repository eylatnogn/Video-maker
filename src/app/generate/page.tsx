import { GenerateForm } from "@/components/GenerateForm";
import { listPersonas } from "@/lib/pipeline/personas";
import { listTemplates } from "@/lib/templates";

export const dynamic = "force-dynamic";

export default async function GeneratePage({ searchParams }: { searchParams: Promise<{ persona?: string }> }) {
  const { persona } = await searchParams;
  const [personas, templates] = await Promise.all([listPersonas(), listTemplates()]);
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Generate a video</h1>
      <GenerateForm personas={personas} templates={templates} initialPersonaId={persona} />
    </div>
  );
}
