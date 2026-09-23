import { beforeEach, describe, expect, it } from "vitest";
import { createPersona, getPersona, setPrimaryPhoto } from "@/lib/pipeline/personas";
import { saveFile } from "@/lib/storage";
import { freshDataDir, photoFile, PNG_BYTES } from "./helpers";

describe("createPersona", () => {
  beforeEach(async () => {
    await freshDataDir();
  });

  it("links uploaded photos and records consent", async () => {
    const a = await photoFile("a.png");
    const b = await photoFile("b.png");
    const persona = await createPersona({ name: "Me", consent: true, photoFileIds: [a.id, b.id, a.id] });
    expect(persona.photoIds).toEqual([a.id, b.id]);
    expect(persona.primaryPhotoId).toBe(a.id);
    expect(persona.consent.confirmedAt).toBeTruthy();
    expect(await getPersona(persona.id)).toMatchObject({ name: "Me" });
  });

  it("refuses without consent", async () => {
    const a = await photoFile();
    await expect(createPersona({ name: "Me", consent: false, photoFileIds: [a.id] })).rejects.toThrow(/confirm/);
  });

  it("refuses non-image files, unknown files and empty names", async () => {
    const clip = await saveFile(PNG_BYTES, "video/mp4", "x.mp4");
    await expect(createPersona({ name: "Me", consent: true, photoFileIds: [clip.id] })).rejects.toThrow(/not a supported image/);
    await expect(createPersona({ name: "Me", consent: true, photoFileIds: ["file_nope"] })).rejects.toThrow(/Unknown photo/);
    const a = await photoFile();
    await expect(createPersona({ name: "  ", consent: true, photoFileIds: [a.id] })).rejects.toThrow(/Name/);
    await expect(createPersona({ name: "Me", consent: true, photoFileIds: [] })).rejects.toThrow(/at least/);
  });

  it("can change the primary photo", async () => {
    const a = await photoFile("a.png");
    const b = await photoFile("b.png");
    const persona = await createPersona({ name: "Me", consent: true, photoFileIds: [a.id, b.id] });
    const updated = await setPrimaryPhoto(persona.id, b.id);
    expect(updated.primaryPhotoId).toBe(b.id);
    await expect(setPrimaryPhoto(persona.id, "file_nope")).rejects.toThrow(/belong/);
  });
});
