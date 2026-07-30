import { describe, expect, it } from "vitest";
import { parseInsightsResponseBody } from "@/lib/actions/chetto";

describe("parseInsightsResponseBody", () => {
  it("parses OpenAPI done line with reply", () => {
    const raw = [
      '{"type":"message","data":{"text":"Thinking…"}}',
      '{"type":"done","data":{"chat_id":"c1","message_id":"m1","reply":"Member prefers morning slots."}}',
    ].join("\n");
    expect(parseInsightsResponseBody(raw)).toBe("Member prefers morning slots.");
  });

  it("accumulates message stream tokens (legacy token + OpenAPI message)", () => {
    const tokenStream = [
      '{"type":"token","data":{"text":"Hello "}}',
      '{"type":"token","data":{"text":"world"}}',
    ].join("\n");
    expect(parseInsightsResponseBody(tokenStream)).toBe("Hello world");

    const messageStream = [
      '{"type":"message","data":{"content":"Hi "}}',
      '{"type":"message","data":{"content":"there"}}',
    ].join("\n");
    expect(parseInsightsResponseBody(messageStream)).toBe("Hi there");
  });

  it("returns plain JSON answer fields", () => {
    expect(parseInsightsResponseBody('{"reply":"ok"}')).toBe("ok");
    expect(parseInsightsResponseBody('{"answer":"from answer key"}')).toBe(
      "from answer key",
    );
  });
});

describe("QUEENDOM_TO_SUB_ORG static fallback", () => {
  it("remains defined for offline fallback", async () => {
    const { QUEENDOM_TO_SUB_ORG } = await import("@/lib/actions/chetto");
    expect(QUEENDOM_TO_SUB_ORG["Ananyshree Queendom"]).toMatch(/^[a-f0-9]{32}$/);
    expect(QUEENDOM_TO_SUB_ORG.Unassigned).toMatch(/^[a-f0-9]{32}$/);
  });
});
