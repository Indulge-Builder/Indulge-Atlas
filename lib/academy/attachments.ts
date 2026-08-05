/**
 * Academy chat attachments — one classifier, shared by every layer.
 *
 * Before this module existed the same question ("what kind of file is this?")
 * was answered independently in four places — the composer, the upload action,
 * the chat route's zod schema and the bubble — and they disagreed. A PDF passed
 * the parts that looked at the extension and was dropped by the parts that only
 * understood `image/` and `video/`, so it failed silently in one place and with
 * a misleading error in the next.
 *
 * Pure module: no `"use server"`, no browser APIs, no imports. It is used by a
 * client component, a server action, a route handler and an RSC-safe bubble, so
 * it must stay importable from all four.
 */

/** What a shared file is, as far as the transcript is concerned. */
export type AttachmentKind = "image" | "video" | "document";

/** Wire-order list — keep in sync with the zod enum in the chat route. */
export const ATTACHMENT_KINDS = ["image", "video", "document"] as const;

/**
 * Document types the drill accepts. PDF only, deliberately: a concierge shares
 * itineraries, quotes and proposals as PDFs, and every other office format
 * would need a renderer the chat does not have.
 */
export const DOCUMENT_MIMES = ["application/pdf"] as const;

/**
 * Extension fallback, and it is load-bearing rather than belt-and-braces.
 * A browser reports the OS-registered type for a picked file, and that is not
 * guaranteed to be `application/pdf` — Windows installs with no PDF handler
 * report `""`, and several Android/Chrome builds report
 * `application/octet-stream`. Classifying on MIME alone loses those files.
 */
const DOCUMENT_EXTENSIONS = [".pdf"];

/** MIME values that carry no information and must not veto the extension. */
const OPAQUE_MIMES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

/**
 * Per-kind ceilings, tighter than the bucket's coarse 50MB limit.
 *
 * Documents sit between photos and video: a market-entry study or a full
 * itinerary runs to a few MB, and anything past 20MB is a scan that should have
 * been compressed before it was ever sent to a member.
 */
export const MAX_ATTACHMENT_BYTES: Record<AttachmentKind, number> = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  document: 20 * 1024 * 1024,
};

/**
 * `accept` for the composer's file input.
 *
 * Both the MIME and the bare extension are listed on purpose: the MIME alone
 * greys out PDFs in the picker on any machine whose OS does not map `.pdf`, and
 * the extension alone is ignored by some mobile pickers.
 */
export const ATTACHMENT_ACCEPT = "image/*,video/*,application/pdf,.pdf";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/**
 * Decide what a picked file is, or null when it is nothing we accept.
 *
 * MIME wins when it says something; the extension is consulted only when the
 * browser handed us an opaque type. `name` is optional so callers that only
 * hold a MIME (the persona route, replaying a stored attachment) still work.
 */
export function classifyAttachment(
  mime: string | null | undefined,
  name?: string | null,
): AttachmentKind | null {
  const type = (mime ?? "").trim().toLowerCase();
  const ext = extensionOf((name ?? "").trim());

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if ((DOCUMENT_MIMES as readonly string[]).includes(type)) return "document";

  // Opaque or absent type — fall back to what the file is called.
  if (OPAQUE_MIMES.has(type) && DOCUMENT_EXTENSIONS.includes(ext)) return "document";

  return null;
}

/**
 * The content type to store the object under.
 *
 * Storage checks the declared type against the bucket's allow-list, so an
 * `application/octet-stream` PDF would be refused by the bucket even after the
 * application layer accepted it. Declaring the real type also means the signed
 * URL opens the file in the browser instead of forcing a download.
 */
export function resolveContentType(
  mime: string | null | undefined,
  name?: string | null,
): string {
  const type = (mime ?? "").trim().toLowerCase();
  if (classifyAttachment(type, name) === "document" && !(DOCUMENT_MIMES as readonly string[]).includes(type)) {
    return "application/pdf";
  }
  return type || "application/octet-stream";
}

/** Human label for a kind — used in previews, placeholders and error copy. */
export function attachmentKindLabel(kind: AttachmentKind): string {
  if (kind === "video") return "Video";
  if (kind === "document") return "Document";
  return "Photo";
}

export function maxBytesFor(kind: AttachmentKind): number {
  return MAX_ATTACHMENT_BYTES[kind];
}

/** "Videos must be under 50MB" — one wording, wherever the cap is enforced. */
export function attachmentSizeError(kind: AttachmentKind): string {
  const plural =
    kind === "image" ? "Images" : kind === "video" ? "Videos" : "Documents";
  return `${plural} must be under ${Math.round(maxBytesFor(kind) / 1024 / 1024)}MB`;
}

/** Shown when a file is picked that we do not accept. */
export const UNSUPPORTED_ATTACHMENT_ERROR =
  "Only images, videos and PDF documents can be shared";

/**
 * Body stored for a turn that carries a file and no text, so the transcript,
 * the evaluator and the ticket reviewer all still read as sentences.
 */
export function placeholderBody(kind: AttachmentKind): string {
  if (kind === "video") return "[shared a video]";
  if (kind === "document") return "[shared a document]";
  return "[shared a photo]";
}

const PLACEHOLDER_BODY_PATTERN = /^\[shared a (photo|video|document)\]$/;

/** True for a synthetic media-only body — the bubble hides it above the file. */
export function isPlaceholderBody(body: string): boolean {
  return PLACEHOLDER_BODY_PATTERN.test(body.trim());
}

/**
 * How a shared file is described to the persona model.
 *
 * Images are inlined for the model to actually see; video and documents cannot
 * be, so they are narrated instead. The wording matters: the persona must not
 * invent contents it was never shown, so each line says what the member can
 * observe and stops there.
 */
export function attachmentDescription(kind: AttachmentKind, name: string): string {
  if (kind === "video") {
    return `[The concierge shared a video: ${name}. You can see it plays, but describe only what they tell you about it.]`;
  }
  if (kind === "document") {
    return `[The concierge shared a PDF document: ${name}. You can see the file has arrived and can open it, but you do not know what is inside it beyond what they tell you — ask if the detail matters.]`;
  }
  return `[The concierge shared an image: ${name}.]`;
}
