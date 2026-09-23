import { PersonaForm } from "@/components/PersonaForm";
import { config } from "@/lib/config";
import { CONSENT_STATEMENT } from "@/lib/pipeline/personas";

export default function NewPersonaPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New persona</h1>
        <p className="mt-1 text-sm text-muted">Photos are stored locally and only sent to the video provider you configure.</p>
      </div>
      <PersonaForm consentStatement={CONSENT_STATEMENT} maxPhotos={config().limits.maxPhotos} />
    </div>
  );
}
