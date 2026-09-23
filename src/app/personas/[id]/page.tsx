import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoPicker } from "@/components/PhotoPicker";
import { getPersona } from "@/lib/pipeline/personas";

export const dynamic = "force-dynamic";

export default async function PersonaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const persona = await getPersona(id);
  if (!persona) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{persona.name}</h1>
          <p className="text-sm text-muted">
            Consent recorded {new Date(persona.consent.confirmedAt).toLocaleString()}
          </p>
        </div>
        <Link href={`/generate?persona=${persona.id}`} className="rounded bg-accent px-4 py-2 font-medium text-white">
          Make a video
        </Link>
      </div>
      <p className="text-sm text-muted">Click a photo to make it the reference the model uses.</p>
      <PhotoPicker personaId={persona.id} photoIds={persona.photoIds} primaryPhotoId={persona.primaryPhotoId} />
    </div>
  );
}
