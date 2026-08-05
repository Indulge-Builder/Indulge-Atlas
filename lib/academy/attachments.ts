/**
 * How a picked file is classified, in one place.
 *
 * The composer and the upload action both have to answer "what kind of file is
 * this?", and both used to answer it with `file.type.startsWith(...)` written
 * out separately. That works for the common case and fails for a real one: a
 * browser reports the OS-registered type for a picked file, and that is not
 * guaranteed to be `application/pdf`. Windows with no registered PDF handler
 * reports `""`, and several Android/Chrome builds report
 * `application/octet-stream`. On those machines a perfectly ordinary PDF is
 * classified as null and refused.
 *
 * The same guess also reached storage. `academy-attachments` matches an
 * upload's DECLARED content type against its MIME allow-list, so uploading a
 * PDF as `application/octet-stream` is rejected by the bucket after every
 * application-layer check has already passed — a failure with no visible cause.
 *
 * Pure module: no I/O, no "use server". Imported by a client component and a
 * server action, so it must stay importable from both.
 */

/** Matches `TrainingAttachment["kind"]` in `lib/types/database.ts`. */
export type AttachmentKind = "image" | "video" | "document";

/**
 * Document types the drill accepts. PDF only, deliberately — a general document
 * allow-list would let anything through a bucket whose contents are rendered
 * back to users.
 */
export const DOCUMENT_MIMES = ["application/pdf"] as const;

/** Extension fallback, used only when the browser's type says nothing. */
const DOCUMENT_EXTENSIONS = [".pdf"];

/** Types that carry no information and must not veto the extension. */
const OPAQUE_MIMES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

/**
 * `accept` for the composer's file input.
 *
 * Both the MIME and the bare extension are listed on purpose: the MIME alone
 * greys out PDFs in the picker on any machine whose OS does not map `.pdf`.
 */
export const ATTACHMENT_ACCEPT = "image/*,video/*,application/pdf,.pdf";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/**
 * What a picked file is, or null when it is nothing we accept.
 *
 * MIME wins whenever it says something; the extension is consulted only for an
 * opaque type. `name` is optional so a caller holding only a MIME still works.
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
  if (OPAQUE_MIMES.has(type) && DOCUMENT_EXTENSIONS.includes(ext)) return "document";

  return null;
}

/**
 * The content type to store the object under — never the browser's raw guess.
 *
 * Declaring the real type is what gets the upload past the bucket's allow-list,
 * and it also makes the signed URL open the file rather than download it.
 */
export function resolveContentType(
  mime: string | null | undefined,
  name?: string | null,
): string {
  const type = (mime ?? "").trim().toLowerCase();
  if (
    classifyAttachment(type, name) === "document" &&
    !(DOCUMENT_MIMES as readonly string[]).includes(type)
  ) {
    return "application/pdf";
  }
  return type || "application/octet-stream";
}
