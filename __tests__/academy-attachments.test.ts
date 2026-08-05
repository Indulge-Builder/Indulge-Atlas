/**
 * Academy chat attachments — PDF support, end to end.
 *
 * THE BUG THIS PINS
 *   A PDF was rejected at six independent layers, each of which had made its own
 *   decision about what a file is:
 *
 *     1. the composer's `accept` (image/*,video/*)      — greyed out in the picker
 *     2. the composer's classifier                      — dropped the file SILENTLY
 *     3. the upload action's classifier                 — "Only images and videos"
 *     4. the storage bucket's mime allow-list           — refused after all checks passed
 *     5. the chat route's zod enum (["image","video"])  — 400, "message was not sent"
 *     6. the bubble's renderer                          — would have drawn a PDF as <img>
 *
 *   Layer 2 is why it read as "nothing was sent": with the file silently
 *   discarded there was no attachment, and a composer with neither text nor an
 *   attachment keeps Send disabled. Layer 5 is where the exact wording came
 *   from once a document did reach the wire.
 *
 * WHAT IS TESTED
 *   The pure classifier that all six layers now share, plus source-level guards
 *   that each layer still routes through it. A unit test of the classifier alone
 *   would have passed happily on the broken build — every layer had its own copy
 *   of the logic, which is precisely how they drifted apart.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_KINDS,
  DOCUMENT_MIMES,
  MAX_ATTACHMENT_BYTES,
  UNSUPPORTED_ATTACHMENT_ERROR,
  attachmentDescription,
  attachmentKindLabel,
  attachmentSizeError,
  classifyAttachment,
  isPlaceholderBody,
  maxBytesFor,
  placeholderBody,
  resolveContentType,
  type AttachmentKind,
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
    // Windows with no registered PDF handler, and several Android/Chrome builds.
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
    expect(classifyAttachment("application/octet-stream", "payload.zip")).toBeNull();
    expect(classifyAttachment("application/octet-stream", "noextension")).toBeNull();
  });

  it("treats a missing type and a missing name as unclassifiable, not as a crash", () => {
    expect(classifyAttachment(null, null)).toBeNull();
    expect(classifyAttachment(undefined)).toBeNull();
    expect(classifyAttachment("")).toBeNull();
  });
});

describe("resolveContentType", () => {
  it("declares application/pdf for a PDF the browser typed opaquely", () => {
    // Load-bearing: storage matches the bucket allow-list against the type we
    // declare, so uploading a PDF as octet-stream is refused by the bucket.
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

describe("size ceilings", () => {
  it("gives documents their own cap, between photos and video", () => {
    expect(MAX_ATTACHMENT_BYTES.image).toBe(10 * 1024 * 1024);
    expect(MAX_ATTACHMENT_BYTES.video).toBe(50 * 1024 * 1024);
    expect(MAX_ATTACHMENT_BYTES.document).toBe(20 * 1024 * 1024);
  });

  it("stays within the bucket's 50MB ceiling for every kind", () => {
    for (const kind of ATTACHMENT_KINDS) {
      expect(maxBytesFor(kind)).toBeLessThanOrEqual(52_428_800);
    }
  });

  it("words the cap per kind", () => {
    expect(attachmentSizeError("image")).toBe("Images must be under 10MB");
    expect(attachmentSizeError("video")).toBe("Videos must be under 50MB");
    expect(attachmentSizeError("document")).toBe("Documents must be under 20MB");
  });
});

describe("placeholder bodies", () => {
  it("round-trips for every kind", () => {
    for (const kind of ATTACHMENT_KINDS) {
      expect(isPlaceholderBody(placeholderBody(kind))).toBe(true);
    }
  });

  it("keeps the wording the transcript already used for photos and video", () => {
    // Sessions closed before this change store these exact strings, and the
    // evaluator reads them. Changing them would rewrite history.
    expect(placeholderBody("image")).toBe("[shared a photo]");
    expect(placeholderBody("video")).toBe("[shared a video]");
    expect(placeholderBody("document")).toBe("[shared a document]");
  });

  it("does not mistake a real reply for a placeholder", () => {
    expect(isPlaceholderBody("Here is the study you asked for.")).toBe(false);
    expect(isPlaceholderBody("[shared a photo] and here is why")).toBe(false);
    expect(isPlaceholderBody("")).toBe(false);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isPlaceholderBody("  [shared a document]\n")).toBe(true);
  });
});

describe("labels and persona descriptions", () => {
  it("labels each kind for the composer and the bubble", () => {
    expect(attachmentKindLabel("image")).toBe("Photo");
    expect(attachmentKindLabel("video")).toBe("Video");
    expect(attachmentKindLabel("document")).toBe("Document");
  });

  it("tells the persona a PDF arrived without inventing its contents", () => {
    const text = attachmentDescription("document", REPORTED_PDF);
    expect(text).toContain(REPORTED_PDF);
    expect(text).toMatch(/PDF/i);
    // The persona is never shown the file, so it must not be told what is in it.
    expect(text).toMatch(/do not know what is inside/i);
  });

  it("names the file for every kind", () => {
    for (const kind of ATTACHMENT_KINDS) {
      expect(attachmentDescription(kind, "brief.ext")).toContain("brief.ext");
    }
  });
});

describe("the accept attribute", () => {
  it("offers PDFs by both mime and extension", () => {
    // The mime alone greys out PDFs on a machine with no registered handler;
    // the extension alone is ignored by some mobile pickers. Both are needed.
    expect(ATTACHMENT_ACCEPT).toContain("application/pdf");
    expect(ATTACHMENT_ACCEPT).toContain(".pdf");
  });

  it("still offers images and videos", () => {
    expect(ATTACHMENT_ACCEPT).toContain("image/*");
    expect(ATTACHMENT_ACCEPT).toContain("video/*");
  });
});

describe("every layer routes through the shared classifier", () => {
  it("the composer classifies with it and does not re-derive kinds from mime prefixes", () => {
    const src = read("components", "academy", "AcademyComposer.tsx");
    expect(src).toContain("classifyAttachment");
    expect(src).toContain("ATTACHMENT_ACCEPT");
    // The old local classifier is what silently dropped the file.
    expect(src).not.toMatch(/file\.type\.startsWith\(/);
  });

  it("the composer reports a rejected file instead of dropping it silently", () => {
    const src = read("components", "academy", "AcademyComposer.tsx");
    expect(src).toContain("UNSUPPORTED_ATTACHMENT_ERROR");
    expect(src).toContain("toast.error");
  });

  it("the composer enables Send on an attachment alone, with no text", () => {
    const src = read("components", "academy", "AcademyComposer.tsx");
    // VALID MESSAGE = text OR attachment.
    expect(src).toMatch(/value\.trim\(\)\.length > 0 \|\| attachment !== null/);
  });

  it("the upload action classifies with it and declares a resolved content type", () => {
    const src = read("lib", "actions", "academy.ts");
    expect(src).toContain("classifyAttachment");
    expect(src).toContain("resolveContentType");
    expect(src).not.toContain("Only images and videos can be shared");
    // The declared type must be the resolved one, never the browser's raw guess.
    expect(src).not.toMatch(/contentType:\s*file\.type/);
  });

  it("the chat route's wire schema accepts every kind the classifier can return", () => {
    const src = read("app", "api", "academy", "chat", "route.ts");
    expect(src).toContain("z.enum(ATTACHMENT_KINDS)");
    expect(src).not.toMatch(/z\.enum\(\["image",\s*"video"\]\)/);
  });

  it("the chat route accepts an attachment-only turn", () => {
    const src = read("app", "api", "academy", "chat", "route.ts");
    // A turn must carry something — text, media, or both. Not text alone.
    expect(src).toMatch(/!internBody && attachments\.length === 0/);
  });

  it("the bubble renders documents rather than forcing every file into an <img>", () => {
    const src = read("components", "academy", "AcademyBubble.tsx");
    expect(src).toMatch(/attachment\.kind === "document"/);
    expect(src).toContain("isPlaceholderBody");
  });
});

describe("the storage bucket allows the same set", () => {
  /**
   * Executable SQL only. These files carry long rationale comments that mention
   * the very patterns being asserted against (`'application/*'` appears in the
   * comment explaining why it is NOT used), so asserting over raw text checks
   * the prose rather than the statement.
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
    // The transcript is graded work; a public bucket would expose every
    // session's attachments to anyone holding a URL.
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
    const sql = migration();
    for (const mime of DOCUMENT_MIMES) {
      expect(sql).toContain(mime);
    }
  });
});

describe("the server action body limit", () => {
  it("is raised above Next's 1MB default, or no real PDF can reach the action", () => {
    const src = read("next.config.ts");
    expect(src).toContain("bodySizeLimit");
    const match = src.match(/bodySizeLimit:\s*"(\d+)mb"/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(20);
  });
});

describe("kinds stay in lockstep with the stored type", () => {
  it("ATTACHMENT_KINDS covers the TrainingAttachment union exactly", () => {
    const src = read("lib", "types", "database.ts");
    const union = src.match(/kind:\s*("image"[^;]*?);/);
    expect(union).not.toBeNull();
    const declared = [...union![1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(new Set(declared)).toEqual(new Set(ATTACHMENT_KINDS));
  });

  it("labels, caps and placeholders exist for every kind", () => {
    for (const kind of ATTACHMENT_KINDS satisfies readonly AttachmentKind[]) {
      expect(attachmentKindLabel(kind)).toBeTruthy();
      expect(maxBytesFor(kind)).toBeGreaterThan(0);
      expect(placeholderBody(kind)).toBeTruthy();
    }
  });

  it("has an unsupported-file message that names what IS supported", () => {
    expect(UNSUPPORTED_ATTACHMENT_ERROR).toMatch(/image/i);
    expect(UNSUPPORTED_ATTACHMENT_ERROR).toMatch(/video/i);
    expect(UNSUPPORTED_ATTACHMENT_ERROR).toMatch(/PDF/i);
  });
});
