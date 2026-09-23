import { beforeEach, describe, expect, it } from "vitest";
import { createPersona, getPersona, setPrimaryPhoto } from "@/lib/pipeline/personas";
import { getFile } from "@/lib/storage";
import { freshDataDir, PNG_BYTES } from "./helpers";

const photo = (name = "a.png") => ({ data: PNG_BYTES, mime: "image/png", name });

describe("createPersona", () => {
  beforeEach(async () => {
    await freshDataDir();
  });

  it("stores photos and records consent", async () => {
    const persona = await createPersona({ name: "Me", consent: true, photos: [photo("a.png"), photo("b.png")] });
    expect(persona.photoIds).toHaveLength(2);
    expect(persona.primaryPhotoId).toBe(persona.photoIds[0]);
    expect(persona.consent.confirmedAt).toBeTruthy();
    const file = await getFile(persona.photoIds[0]);
    expect(file?.mime).toBe("image/png");
    expect(file?.size).toBe(PNG_BYTES.byteLength);
    expect(await getPersona(persona.id)).toMatchObject({ name: "Me" });
  });

  it("refuses without consent", async () => {
    await expect(createPersona({ name: "Me", consent: false, photos: [photo()] })).rejects.toThrow(/confirm/);
  });

  it("refuses non-image uploads and empty names", async () => {
    await expect(
      createPersona({ name: "Me", consent: true, photos: [{ data: PNG_BYTES, mime: "video/mp4", name: "x.mp4" }] }),
    ).rejects.toThrow(/Unsupported/);
    await expect(createPersona({ name: "  ", consent: true, photos: [photo()] })).rejects.toThrow(/Name/);
    await expect(createPersona({ name: "Me", consent: true, photos: [] })).rejects.toThrow(/at least/);
  });

  it("can change the primary photo", async () => {
    const persona = await createPersona({ name: "Me", consent: true, photos: [photo("a.png"), photo("b.png")] });
    const updated = await setPrimaryPhoto(persona.id, persona.photoIds[1]);
    expect(updated.primaryPhotoId).toBe(persona.photoIds[1]);
    await expect(setPrimaryPhoto(persona.id, "file_nope")).rejects.toThrow(/belong/);
  });
});
