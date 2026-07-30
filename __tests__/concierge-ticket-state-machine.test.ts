import { describe, it, expect } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  isTransitionAllowed,
  allowedTransitionsFrom,
  evaluateEntryGate,
  validateStatusChange,
  type TicketGateContext,
} from "@/lib/concierge/ticketStateMachine";

function ctx(partial: Partial<TicketGateContext> = {}): TicketGateContext {
  return {
    from: "open",
    to: "pending",
    hasPrimaryVendor: false,
    vendorHasContact: false,
    noteBodyProvided: false,
    hasProofAttachment: false,
    trackingIdProvided: false,
    invoiceComplete: false,
    invoiceAttachmentLinked: false,
    isBillableDecided: false,
    isBillable: false,
    invoiceNumberPresent: false,
    checklistTotal: 0,
    checklistChecked: 0,
    isAdminOverride: false,
    ...partial,
  };
}

describe("ALLOWED_TRANSITIONS", () => {
  it("does not allow open → closed (must pass through resolved)", () => {
    expect(ALLOWED_TRANSITIONS.open).not.toContain("closed");
  });
  it("allows resolved → closed and resolved → open (reopen)", () => {
    expect(ALLOWED_TRANSITIONS.resolved).toEqual(["open", "closed"]);
  });
  it("allows closed → open only (reopen)", () => {
    expect(ALLOWED_TRANSITIONS.closed).toEqual(["open"]);
  });
  it("restricts invoice_due to open / ongoing_delivery / resolved", () => {
    expect(ALLOWED_TRANSITIONS.invoice_due).toEqual(["open", "ongoing_delivery", "resolved"]);
  });
});

describe("isTransitionAllowed", () => {
  it("rejects a no-op transition", () => {
    expect(isTransitionAllowed("open", "open")).toBe(false);
  });
  it("respects the matrix", () => {
    expect(isTransitionAllowed("resolved", "closed")).toBe(true);
    expect(isTransitionAllowed("open", "closed")).toBe(false);
  });
  it("lets an admin override force any transition", () => {
    expect(isTransitionAllowed("open", "closed", true)).toBe(true);
  });
});

describe("allowedTransitionsFrom", () => {
  it("returns the matrix row for a normal user", () => {
    expect(allowedTransitionsFrom("invoice_due")).toEqual(["open", "ongoing_delivery", "resolved"]);
  });
  it("returns every other status for an admin override", () => {
    const all = allowedTransitionsFrom("open", true);
    expect(all).not.toContain("open");
    expect(all).toContain("closed");
    expect(all.length).toBe(7);
  });
});

describe("validateStatusChange — transition legality", () => {
  it("blocks an illegal transition with transition_not_allowed", () => {
    const r = validateStatusChange(ctx({ from: "open", to: "closed" }));
    expect(r.ok).toBe(false);
    expect(r.transitionAllowed).toBe(false);
    expect(r.blocked[0].code).toBe("transition_not_allowed");
  });
});

describe("entry gate — nudge_vendor", () => {
  it("blocks without a vendor-with-contact and without a note", () => {
    const r = evaluateEntryGate(ctx({ from: "open", to: "nudge_vendor" }));
    expect(r.ok).toBe(false);
    const codes = r.blocked.map((b) => b.code);
    expect(codes).toContain("vendor_contact_required");
    expect(codes).toContain("nudge_note_required");
  });
  it("passes with a contactable vendor and a note", () => {
    const r = evaluateEntryGate(
      ctx({ from: "open", to: "nudge_vendor", hasPrimaryVendor: true, vendorHasContact: true, noteBodyProvided: true }),
    );
    expect(r.ok).toBe(true);
    expect(r.blocked).toHaveLength(0);
  });
});

describe("entry gate — nudge_client", () => {
  it("requires a note", () => {
    expect(evaluateEntryGate(ctx({ from: "open", to: "nudge_client" })).ok).toBe(false);
    expect(evaluateEntryGate(ctx({ from: "open", to: "nudge_client", noteBodyProvided: true })).ok).toBe(true);
  });
});

describe("entry gate — ongoing_delivery (proof)", () => {
  it("blocks without proof or tracking id", () => {
    const r = evaluateEntryGate(ctx({ from: "open", to: "ongoing_delivery" }));
    expect(r.ok).toBe(false);
    expect(r.blocked[0].code).toBe("proof_required");
  });
  it("passes with a proof attachment", () => {
    expect(evaluateEntryGate(ctx({ from: "open", to: "ongoing_delivery", hasProofAttachment: true })).ok).toBe(true);
  });
  it("passes with a tracking id", () => {
    expect(evaluateEntryGate(ctx({ from: "open", to: "ongoing_delivery", trackingIdProvided: true })).ok).toBe(true);
  });
});

describe("entry gate — invoice_due", () => {
  it("requires a complete invoice AND a linked invoice attachment", () => {
    const r = evaluateEntryGate(ctx({ from: "ongoing_delivery", to: "invoice_due" }));
    expect(r.blocked.map((b) => b.code).sort()).toEqual(["invoice_attachment_required", "invoice_incomplete"]);
  });
  it("passes when both are present", () => {
    const r = evaluateEntryGate(
      ctx({ from: "ongoing_delivery", to: "invoice_due", invoiceComplete: true, invoiceAttachmentLinked: true }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("entry gate — resolved (billable + invoice number)", () => {
  it("requires a billable decision", () => {
    const r = evaluateEntryGate(ctx({ from: "open", to: "resolved" }));
    expect(r.ok).toBe(false);
    expect(r.blocked[0].code).toBe("billable_required");
  });
  it("passes when non-billable is decided", () => {
    const r = evaluateEntryGate(ctx({ from: "open", to: "resolved", isBillableDecided: true, isBillable: false }));
    expect(r.ok).toBe(true);
  });
  it("requires an invoice number when billable", () => {
    const r = evaluateEntryGate(
      ctx({ from: "open", to: "resolved", isBillableDecided: true, isBillable: true }),
    );
    expect(r.ok).toBe(false);
    expect(r.blocked[0].code).toBe("invoice_number_required");
  });
  it("passes when billable with an invoice number", () => {
    const r = evaluateEntryGate(
      ctx({ from: "open", to: "resolved", isBillableDecided: true, isBillable: true, invoiceNumberPresent: true }),
    );
    expect(r.ok).toBe(true);
  });
  it("warns (does not block) on an incomplete checklist in warn mode", () => {
    const r = evaluateEntryGate(
      ctx({ from: "open", to: "resolved", isBillableDecided: true, isBillable: false, checklistTotal: 5, checklistChecked: 3 }),
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain("checklist_incomplete");
  });
});

describe("entry gate — closed", () => {
  it("only allows closing from resolved", () => {
    expect(evaluateEntryGate(ctx({ from: "resolved", to: "closed" })).ok).toBe(true);
    // (open → closed is already blocked at the transition layer; the gate agrees.)
    expect(evaluateEntryGate(ctx({ from: "pending", to: "closed" })).blocked[0].code).toBe("close_from_resolved_only");
  });
});

describe("admin override", () => {
  it("downgrades hard failures to warnings and permits the transition", () => {
    const r = evaluateEntryGate(ctx({ from: "open", to: "nudge_vendor", isAdminOverride: true }));
    expect(r.ok).toBe(true);
    expect(r.blocked).toHaveLength(0);
    expect(r.warnings.map((w) => w.code)).toContain("vendor_contact_required");
  });
});
