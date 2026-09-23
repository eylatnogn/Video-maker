import { listTemplates } from "@/lib/templates";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ templates: await listTemplates() });
}
