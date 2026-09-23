import { promises as fs } from "node:fs";
import path from "node:path";
import type { Template, TemplateCategory } from "./types";

/**
 * Catalogue of motion templates. The metadata is committed; the driving
 * clips are not, because you need a licence for the footage and the music.
 * Drop a clip at `public/templates/<id>.mp4` and the entry becomes active.
 */
interface CatalogueEntry {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  durationSec: number;
  promptHint?: string;
}

export const CATALOGUE: CatalogueEntry[] = [
  {
    id: "dance-hiphop-01",
    name: "Hip-hop groove",
    category: "dance",
    description: "Full-body hip-hop routine, 8 counts, front-facing.",
    durationSec: 10,
    promptHint: "a person dancing hip-hop in a studio, full body, energetic",
  },
  {
    id: "dance-kpop-01",
    name: "K-pop chorus",
    category: "dance",
    description: "Sharp choreography for a chorus section, medium shot.",
    durationSec: 12,
    promptHint: "a person performing a k-pop chorus dance, studio lighting",
  },
  {
    id: "sing-ballad-01",
    name: "Ballad close-up",
    category: "sing",
    description: "Close-up singing performance with expressive lip movement.",
    durationSec: 15,
    promptHint: "a person singing a ballad into a microphone, close-up, cinematic",
  },
  {
    id: "sing-pop-01",
    name: "Pop hook",
    category: "sing",
    description: "Half-body pop vocal performance with hand gestures.",
    durationSec: 12,
    promptHint: "a person singing a pop song, half body, colourful stage",
  },
  {
    id: "act-monologue-01",
    name: "Dramatic monologue",
    category: "act",
    description: "Talking-head delivery with strong facial expressions.",
    durationSec: 10,
    promptHint: "a person delivering a dramatic monologue, shallow depth of field",
  },
];

const PUBLIC_TEMPLATES_DIR = path.join(process.cwd(), "public", "templates");

export async function listTemplates(): Promise<Template[]> {
  let present = new Set<string>();
  try {
    present = new Set(await fs.readdir(PUBLIC_TEMPLATES_DIR));
  } catch {
    /* directory missing: every template is inactive */
  }
  return CATALOGUE.map((entry) => ({
    ...entry,
    drivingVideoUrl: present.has(`${entry.id}.mp4`) ? `/templates/${entry.id}.mp4` : null,
  }));
}

export async function getTemplate(id: string): Promise<Template | undefined> {
  const all = await listTemplates();
  return all.find((t) => t.id === id);
}
