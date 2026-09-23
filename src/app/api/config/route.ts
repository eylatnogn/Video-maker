import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Public, non-secret settings the browser needs to choose an upload path. */
export async function GET() {
  const cfg = config();
  return Response.json({
    provider: cfg.provider,
    directUpload: cfg.fileBackend === "blob",
    limits: cfg.limits,
  });
}
