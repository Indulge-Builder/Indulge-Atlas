import sanitizeHtml from "sanitize-html";

const MAX_FORM_JSON_BYTES = 10 * 1024;
const MAX_NEST_DEPTH = 2;

/** Strip HTML/scripts; safe for plain text fields stored or rendered. */
export function sanitizeText(input: string): string {
  if (input == null) return "";
  const s = String(input);
  return sanitizeHtml(s, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function sanitizeFormValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "symbol") {
    return null;
  }
  if (typeof value === "function") {
    return null;
  }

  if (depth >= MAX_NEST_DEPTH) {
    if (Array.isArray(value)) return [];
    if (typeof value === "object" && value !== null) return null;
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeFormValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      try {
        out[k] = sanitizeFormValue(v, depth + 1);
      } catch {
        out[k] = null;
      }
    }
    return out;
  }

  return String(value);
}

/**
 * Recursively sanitizes string leaves; caps nesting at 2 levels; if serialized
 * size exceeds 10KB (UTF-8), replaces payload with a small safe summary.
 */
export function sanitizeFormData(
  json: Record<string, unknown>,
): Record<string, unknown> {
  let out: Record<string, unknown>;
  try {
    out = {};
    for (const [k, v] of Object.entries(json)) {
      out[k] = sanitizeFormValue(v, 0);
    }
  } catch {
    return { _sanitize_error: true };
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(out);
  } catch {
    return { _sanitize_error: true, _reason: "stringify_failed" };
  }

  if (utf8ByteLength(serialized) <= MAX_FORM_JSON_BYTES) {
    return out;
  }

  return {
    _truncated: true,
    _max_bytes: MAX_FORM_JSON_BYTES,
    excerpt: sanitizeText(serialized.slice(0, 8000)),
  };
}
