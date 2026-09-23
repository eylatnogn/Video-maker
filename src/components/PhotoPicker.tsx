"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PhotoPicker({
  personaId,
  photoIds,
  primaryPhotoId,
}: {
  personaId: string;
  photoIds: string[];
  primaryPhotoId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function choose(photoId: string) {
    setBusy(photoId);
    await fetch(`/api/personas/${personaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryPhotoId: photoId }),
    });
    setBusy(null);
    router.refresh();
  }

  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
      {photoIds.map((id) => {
        const primary = id === primaryPhotoId;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => choose(id)}
              disabled={primary || busy !== null}
              className={`block w-full overflow-hidden rounded-lg border-2 ${primary ? "border-accent" : "border-transparent hover:border-border"}`}
              title={primary ? "Primary reference" : "Use as primary reference"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${id}`} alt="" className="aspect-square w-full object-cover" />
            </button>
            {primary && <span className="mt-1 block text-center text-xs text-accent">primary</span>}
          </li>
        );
      })}
    </ul>
  );
}
