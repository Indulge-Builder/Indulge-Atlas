/**
 * Live sign-off for the Freshdesk ticket reviewer — hits the real Anthropic API.
 *
 * Skipped by default. Run with ACADEMY_LIVE=1 (same gate as
 * `academy-live-signoff.test.ts`), because it costs a real Opus call.
 *
 * What it exists to catch: the offline suite pins the parser against fixtures we
 * wrote. This pins it against what the model ACTUALLY returns — a schema drift
 * or a preamble would make every real submission throw, and no offline test
 * would notice.
 */

import { describe, it, expect } from "vitest";
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  ACADEMY_TICKET_REVIEW_MODEL,
} from "@/lib/academy/models";
import {
  TICKET_REVIEW_OUTPUT_SCHEMA,
  buildTicketReviewPrompt,
  buildVerdict,
  parseTicketReviewResponse,
} from "@/lib/academy/ticketReview";
import type { TicketUpdateInput } from "@/lib/academy/ticket";

const LIVE = process.env.ACADEMY_LIVE === "1";

// A deliberately vague write-up: claims "all sorted" but establishes nothing.
// The reviewer SHOULD reject this.
const weakUpdate: TicketUpdateInput = {
  resolution_summary:
    "Sorted the watch request out and let the member know the outcome today.",
  internal_notes: "Nothing outstanding.",
  public_reply:
    "Hi Priya, all done — your watch is confirmed and everything is arranged. Let me know if you need anything else.",
  status: "resolved",
  priority: "high",
  tags: ["watches", "luxury"],
  time_spent_minutes: 12,
};

describe.skipIf(!LIVE)("ticket reviewer — live", () => {
  it("returns schema-conformant JSON the parser accepts", async () => {
    const { system, user } = buildTicketReviewPrompt({
      requestTitle: "Source a Cartier Tank for an anniversary",
      clientName: "Priya Nair",
      idealOutcome:
        "Confirm authenticity, quote a real price with warranty terms, and give a delivery date before the anniversary.",
      transcript:
        "Client: I need a Cartier Tank before the 14th, it's for our anniversary.\n" +
        "Concierge: Of course, let me look into it.\n" +
        "Client: Any update? Budget is flexible but I want it authenticated.\n" +
        "Concierge: All sorted, it's confirmed.",
      update: weakUpdate,
    });

    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ACADEMY_TICKET_REVIEW_MODEL,
        max_tokens: 1500,
        stream: false,
        system,
        messages: [{ role: "user", content: user }],
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: TICKET_REVIEW_OUTPUT_SCHEMA },
        },
      }),
    });

    expect(res.ok, `API returned ${res.status}`).toBe(true);
    const body = (await res.json()) as {
      content?: { text?: string }[];
      stop_reason?: string;
    };
    // Truncation would be silently persisted as a parse error in production.
    expect(body.stop_reason).not.toBe("max_tokens");

    const parsed = parseTicketReviewResponse(body.content?.[0]?.text?.trim() ?? "");
    const verdict = buildVerdict(parsed, weakUpdate.status, "live-signoff");

    // The reviewer must reject a write-up that claims what the transcript never
    // established — and must say what to fix.
    expect(verdict.passed).toBe(false);
    expect(verdict.feedback.length).toBeGreaterThan(0);
    expect(verdict.quality).toBeGreaterThan(0);

    console.log(
      `[live] quality=${verdict.quality}/5 passed=${verdict.passed}\n` +
        Object.entries(parsed.scores)
          .map(([k, v]) => `  ${k}=${v.score}`)
          .join("\n") +
        `\nfeedback:\n${verdict.feedback.map((f) => `  - ${f}`).join("\n")}`,
    );
  }, 120_000);
});
