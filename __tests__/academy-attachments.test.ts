/**
 * Academy attachments — PDF classification and storage content type.
 *
 * SCOPE. Multi-file picking, per-kind size caps, the rejection toast and the
 * PDF bubble all live elsewhere and are main's; this suite covers the one thing
 * that is easy to get subtly wrong and impossible to see when it breaks:
 * deciding *what a file is* and *what type to store it under*.
 *
 * THE FAILURE THIS PINS
 *   1. `file.type.startsWith(...)` / `file.type === "application/pdf"` is not a
 *      reliable test. A browser reports the OS-registered type for a picked
 *      file: Windows with no PDF handler gives `""`, and several Android/Chrome
 *      builds give `application/octet-stream`. On those machines an ordinary
 *      PDF classified as null and was refused.
 *   2. The upload then declared that same guess as the object's content type.
 *      `academy-attachments` matches its MIME allow-list against the DECLARED
 *      type, so such a PDF was rejected by the bucket after every
 *      application-layer check had passed — a failure with no visible cause.
 *   3. The bucket allow-list did not include `application/pdf` at all
 *      (migration 136), so even a correctly-typed PDF was refused.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ATTACHMENT_ACCEPT,
  DOCUMENT_MIMES,
  classifyAttachment,
  resolveContentType,
} from "@/lib/academy/attachments";

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

/** The file from the bug report, used verbatim. */
const REPORTED_PDF = "Indulge-Global_Malaysia-Market-Entry-Study.pdf";

describe("classifyAttachment", () => {
  it("classifies the PDF from the bug report as a document", () => {
    expect(classifyAttachment("application/pdf", REPORTED_PDF)).toBe("document");
  });

  it("keeps classifying images and videos exactly as before", () => {
    expect(classifyAttachment("image/jpeg", "venue.jpg")).toBe("image");
    expect(classifyAttachment("image/png", "menu.png")).toBe("image");
    expect(classifyAttachment("image/heic", "IMG_0421.heic")).toBe("image");
    expect(classifyAttachment("video/mp4", "walkthrough.mp4")).toBe("video");
    expect(classifyAttachment("video/quicktime", "clip.mov")).toBe("video");
  });

  it("recognises a PDF the browser reported with an opaque type", () => {
    expect(classifyAttachment("application/octet-stream", REPORTED_PDF)).toBe("document");
    expect(classifyAttachment("", REPORTED_PDF)).toBe("document");
    expect(classifyAttachment("binary/octet-stream", "itinerary.pdf")).toBe("document");
  });

  it("is case-insensitive about both the type and the extension", () => {
    expect(classifyAttachment("APPLICATION/PDF", "quote.pdf")).toBe("document");
    expect(classifyAttachment("", "QUOTE.PDF")).toBe("document");
    expect(classifyAttachment("Image/JPEG", "a.jpg")).toBe("image");
  });

  it("accepts a PDF mime even when the name says nothing", () => {
    expect(classifyAttachment("application/pdf")).toBe("document");
    expect(classifyAttachment("application/pdf", "")).toBe("document");
  });

  it("does not widen past PDF — other office and archive formats stay out", () => {
    expect(classifyAttachment("text/plain", "notes.txt")).toBeNull();
    expect(classifyAttachment("application/zip", "photos.zip")).toBeNull();
    expect(classifyAttachment("application/msword", "brief.doc")).toBeNull();
    expect(
      classifyAttachment(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "budget.xlsx",
      ),
    ).toBeNull();
    // An opaque type only falls back for a .pdf name — not for anything else.
    expect(classifyAttachment("application/octet-stream", "payload.zip")).toBeNull();
    expect(classifyAttachment("application/octet-stream", "noextension")).toBeNull();
  });

  it("treats a missing type and name as unclassifiable, not as a crash", () => {
    expect(classifyAttachment(null, null)).toBeNull();
    expect(classifyAttachment(undefined)).toBeNull();
    expect(classifyAttachment("")).toBeNull();
  });
});

describe("resolveContentType", () => {
  it("declares application/pdf for a PDF the browser typed opaquely", () => {
    // Load-bearing: storage matches the bucket allow-list against the declared
    // type, so an octet-stream PDF would be refused by the bucket.
    expect(resolveContentType("application/octet-stream", REPORTED_PDF)).toBe("application/pdf");
    expect(resolveContentType("", REPORTED_PDF)).toBe("application/pdf");
  });

  it("passes a well-typed file straight through", () => {
    expect(resolveContentType("application/pdf", REPORTED_PDF)).toBe("application/pdf");
    expect(resolveContentType("image/jpeg", "venue.jpg")).toBe("image/jpeg");
    expect(resolveContentType("video/mp4", "clip.mp4")).toBe("video/mp4");
  });

  it("never returns an empty content type", () => {
    expect(resolveContentType("", "mystery")).toBe("application/octet-stream");
  });
});

describe("the accept attribute", () => {
  it("offers PDFs by both mime and extension", () => {
    // The mime alone greys out PDFs on a machine with no registered handler.
    expect(ATTACHMENT_ACCEPT).toContain("application/pdf");
    expect(ATTACHMENT_ACCEPT).toContain(".pdf");
  });

  it("still offers images and videos", () => {
    expect(ATTACHMENT_ACCEPT).toContain("image/*");
    expect(ATTACHMENT_ACCEPT).toContain("video/*");
  });
});

describe("both layers route through the shared classifier", () => {
  it("the composer classifies with it rather than testing file.type itself", () => {
    const src = read("components", "academy", "AcademyComposer.tsx");
    expect(src).toContain("classifyAttachment");
    expect(src).toContain("ATTACHMENT_ACCEPT");
    expect(src).not.toMatch(/file\.type\.startsWith\(/);
    expect(src).not.toMatch(/file\.type === "application\/pdf"/);
  });

  it("the upload action classifies with it and declares a resolved type", () => {
    const src = read("lib", "actions", "academy.ts");
    expect(src).toContain("classifyAttachment(file.type, file.name)");
    expect(src).toContain("resolveContentType");
    // The declared type must be the resolved one, never the browser's guess.
    expect(src).not.toMatch(/contentType:\s*file\.type/);
  });
});

describe("the storage bucket allows the same set", () => {
  /**
   * Executable SQL only. These files carry rationale comments that mention the
   * very patterns being asserted against (`'application/*'` appears in the
   * comment explaining why it is NOT used), so asserting over raw text would
   * check the prose rather than the statement.
   */
  const statements = (...parts: string[]) =>
    read(...parts)
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

  const migration = () =>
    statements("supabase", "migrations", "136_academy_pdf_attachments.sql");

  it("adds application/pdf to the bucket's mime allow-list", () => {
    const sql = migration();
    expect(sql).toContain("academy-attachments");
    expect(sql).toMatch(/ARRAY\['image\/\*',\s*'video\/\*',\s*'application\/pdf'\]/);
  });

  it("keeps the bucket private", () => {
    const values = migration().match(/VALUES\s*\(([\s\S]*?)\)\s*ON CONFLICT/i);
    expect(values).not.toBeNull();
    expect(values![1]).toMatch(/\bfalse\b/);
    expect(values![1]).not.toMatch(/\btrue\b/);
  });

  it("does not open the bucket to arbitrary binaries", () => {
    expect(migration()).not.toContain("'application/*'");
    expect(migration()).not.toContain("'*/*'");
  });

  it("matches the standalone apply file", () => {
    const manual = statements("supabase", "manual", "academy_part11_pdf_attachments.sql");
    expect(manual).toMatch(/ARRAY\['image\/\*',\s*'video\/\*',\s*'application\/pdf'\]/);
    expect(manual).not.toContain("'application/*'");
  });

  it("covers every document mime the application will send", () => {
    for (const mime of DOCUMENT_MIMES) {
      expect(migration()).toContain(mime);
    }
  });
});

describe("the server action body limit", () => {
  it("is raised above Next's 1MB default, or no real PDF reaches the action", () => {
    // Separate from the action's own per-kind caps: this ceiling applies to the
    // whole server-action request body and defaults to 1MB, so it rejected a
    // 2MB PDF before any of our validation ran.
    const src = read("next.config.ts");
    expect(src).toContain("bodySizeLimit");
    const match = src.match(/bodySizeLimit:\s*"(\d+)mb"/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(10);
  });
});
