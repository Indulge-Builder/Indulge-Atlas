/**
 * Optional AI proof verifier (advisory only — spec §11).
 *
 * A SOFT layer on top of the deterministic ongoing_delivery / invoice_due gate.
 * Sends a proof attachment (image or PDF) to Haiku and returns a confidence signal.
 * Never blocks and never throws — the deterministic gate in changeTicketStatus is
 * the only hard requirement. Returns null when unavailable/uncertain.
 *
 * Server-only (ANTHROPIC_API_KEY). NOT a "use server" module.
 */
import { getServiceSupabaseClient } from "@/lib/supabase/service";

export interface ProofAdvisory {
  is_valid_proof: boolean;
  confidence: number; // 0..1
  reason: string;
}

const MODEL = "claude-haiku-4-5-20251001";

export async function verifyProofAttachment(storagePath: string, mimeType: string): Promise<ProofAdvisory | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  try {
    const service = getServiceSupabaseClient();
    const { data: blob, error } = await service.storage.from("ticket-attachments").download(storagePath);
    if (error || !blob) return null;
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

    let mediaBlock: Record<string, unknown>;
    if (mimeType.startsWith("image/")) {
      mediaBlock = { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } };
    } else if (mimeType === "application/pdf") {
      mediaBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
    } else {
      return null; // video / other — not verifiable here
    }

    const prompt =
      'You are validating a "proof of confirmation" attachment for a luxury concierge ticket ' +
      "(a booking/reservation/order/delivery confirmation, invoice, ticket, or tracking screenshot). " +
      "Decide whether the attached file plausibly IS such a confirmation. " +
      'Respond with ONLY a JSON object: {"is_valid_proof": boolean, "confidence": number (0..1), "reason": "one short sentence"}.';

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        stream: false,
        messages: [{ role: "user", content: [mediaBlock, { type: "text", text: prompt }] }],
      }),
    });
    if (!response.ok) return null;

    const data = await response.json();
    const text: string =
      (data?.content ?? []).find((b: { type?: string }) => b?.type === "text")?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<ProofAdvisory>;
    if (typeof parsed.is_valid_proof !== "boolean") return null;
    return {
      is_valid_proof: parsed.is_valid_proof,
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    };
  } catch (err) {
    console.error("[verifyProofAttachment]", err);
    return null;
  }
}
