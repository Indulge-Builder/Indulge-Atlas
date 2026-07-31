import { describe, expect, it } from "vitest";
import {
  CHUNK_MAX_DELAY_MS,
  CHUNK_MIN_DELAY_MS,
  SPLIT_MAX_CHUNKS,
  SPLIT_MIN_CHARS,
  chunkDelay,
  splitClientMessage,
} from "@/lib/academy/messageSplit";

/** A real register request — task 2, the one with the watch references. */
const WATCHES =
  "Four pieces from LuxurySouq: Patek Philippe Nautilus 5712R-001, AP Code 11.59 26393NR, " +
  "AP Code 11.59 26394OR, and the AP Code 11.59 Chronograph 26393OR. For each I need the " +
  "reference number, cost, delivery time, year of billing, warranty validity, payment mode " +
  "and timeline. Brand new unused pieces only. I'll likely take at least two.";

describe("splitClientMessage", () => {
  it("leaves a message-length reply alone", () => {
    const short = "What does an airport meet and greet typically cost in India?";
    expect(short.length).toBeLessThan(SPLIT_MIN_CHARS);
    expect(splitClientMessage(short)).toEqual([short]);
  });

  it("returns nothing for empty input", () => {
    expect(splitClientMessage("")).toEqual([]);
    expect(splitClientMessage("   ")).toEqual([]);
  });

  it("splits a long request into at most four bubbles", () => {
    const chunks = splitClientMessage(WATCHES);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(SPLIT_MAX_CHUNKS);
  });

  it("loses no words — the request survives reassembly", () => {
    const chunks = splitClientMessage(WATCHES);
    expect(chunks.join(" ")).toBe(WATCHES);
  });

  it("never slices a product reference mid-token", () => {
    // "11.59" and "5712R-001" appear verbatim in the register; a split inside
    // them would change the request the trainee is answering.
    for (const chunk of splitClientMessage(WATCHES)) {
      expect(chunk).not.toMatch(/\b11\.$/);
      expect(chunk).not.toMatch(/^59\b/);
    }
    const rejoined = splitClientMessage(WATCHES).join(" ");
    for (const ref of ["5712R-001", "26393NR", "26394OR", "11.59"]) {
      expect(rejoined).toContain(ref);
    }
  });

  it("emits no runt fragments", () => {
    const chunks = splitClientMessage(WATCHES);
    // Every bubble after the first carries real content.
    for (const chunk of chunks.slice(1)) {
      expect(chunk.length).toBeGreaterThanOrEqual(20);
    }
  });

  it("does not split a long message that is a single sentence", () => {
    const oneSentence =
      "I need a villa in Goa for twelve guys with eight to ten rooms and a pool and a lawn " +
      "for barbecue if the weather allows and breakfast available for the whole group, " +
      "ideally somewhere in the north with parking for four cars and a caretaker on site";
    expect(oneSentence.length).toBeGreaterThan(SPLIT_MIN_CHARS);
    expect(splitClientMessage(oneSentence)).toEqual([oneSentence]);
  });

  it("honours a lower chunk ceiling", () => {
    expect(splitClientMessage(WATCHES, { maxChunks: 2 }).length).toBeLessThanOrEqual(2);
  });

  it("distributes roughly evenly rather than front-loading", () => {
    const chunks = splitClientMessage(WATCHES);
    const longest = Math.max(...chunks.map((c) => c.length));
    const shortest = Math.min(...chunks.map((c) => c.length));
    // A greedy fill would leave a fat head and a scrap tail.
    expect(longest).toBeLessThan(shortest * 4);
  });
});

describe("chunkDelay", () => {
  it("stays inside the configured window", () => {
    expect(chunkDelay(() => 0)).toBe(CHUNK_MIN_DELAY_MS);
    expect(chunkDelay(() => 0.999)).toBeLessThan(CHUNK_MAX_DELAY_MS);
    for (const r of [0.1, 0.33, 0.5, 0.87]) {
      const d = chunkDelay(() => r);
      expect(d).toBeGreaterThanOrEqual(CHUNK_MIN_DELAY_MS);
      expect(d).toBeLessThanOrEqual(CHUNK_MAX_DELAY_MS);
    }
  });

  it("is not metronomic", () => {
    expect(chunkDelay(() => 0.1)).not.toBe(chunkDelay(() => 0.9));
  });
});
