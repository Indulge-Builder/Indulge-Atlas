/**
 * Role gating and the enums it depends on.
 *
 * Both bugs pinned here were the same shape: a hand-maintained list that drifted
 * from its source, invisible to TypeScript because a subset of a union is still
 * assignable to the union's array type. One broke user creation outright.
 */

import { describe, it, expect } from "vitest";
import { canReturnToAtlas } from "@/lib/academy/shell";
import { createUserSchema } from "@/lib/validations/user";
import { ALL_DEPARTMENTS } from "@/lib/constants/departments";
import { isPrivilegedRole, type EmployeeDepartment, type UserRole } from "@/lib/types/database";

// ── "← Atlas" visibility ─────────────────────────────────────────────────────

describe("Atlas back-link is administrators only", () => {
  const show = (role: string, inNativeShell = false) =>
    canReturnToAtlas({ role: role as UserRole, inNativeShell });

  it("shows for every elevated role, not just the literal 'admin'", () => {
    // Founders and super_admins outrank admins; hiding Atlas from them would be
    // a downgrade, which is why this is not a `role === "admin"` check.
    for (const role of ["admin", "founder", "super_admin"]) {
      expect(show(role)).toBe(true);
    }
  });

  it("hides for trainees and every other non-elevated role", () => {
    for (const role of ["agent", "manager", "guest", "trainee", ""]) {
      expect(show(role)).toBe(false);
    }
  });

  it("hides for an ordinary agent — the case that regressed", () => {
    // The old condition also passed when department !== "academy", so a
    // concierge agent taking a training session saw a link into the CRM.
    expect(show("agent")).toBe(false);
  });

  it("hides inside the Android shell even for an admin", () => {
    expect(show("admin", true)).toBe(false);
    expect(show("founder", true)).toBe(false);
  });

  it("agrees with isPrivilegedRole, the dashboard's own gate", () => {
    // If these ever diverge the link points somewhere its owner is bounced from.
    for (const role of ["admin", "founder", "super_admin", "manager", "agent", "guest"]) {
      expect(show(role)).toBe(isPrivilegedRole(role));
    }
  });
});

// ── Create-user validation ───────────────────────────────────────────────────

describe("createUser accepts every department the form can offer", () => {
  const base = {
    email: "new.trainee@indulge.global",
    full_name: "New Trainee",
    job_title: "Concierge Trainee",
    role: "agent" as const,
    domain: "indulge_concierge" as const,
    send_invite: true,
  };

  it("accepts the academy department — creating a trainee was impossible", () => {
    // The validator's list had drifted and omitted `academy`, so the form
    // offered the button and then silently rejected the submit.
    const parsed = createUserSchema.safeParse({ ...base, department: "academy" });
    expect(parsed.success).toBe(true);
  });

  it("accepts watcher, added in migration 122 and also missing", () => {
    expect(createUserSchema.safeParse({ ...base, department: "watcher" }).success).toBe(true);
  });

  it("accepts every department the picker renders", () => {
    // ALL_DEPARTMENTS is what the modal maps over. Anything it can show must
    // validate, or the UI offers a choice the server refuses.
    for (const dept of ALL_DEPARTMENTS) {
      const parsed = createUserSchema.safeParse({ ...base, department: dept });
      expect(parsed.success, `department "${dept}" must validate`).toBe(true);
    }
  });

  it("still rejects a department that does not exist", () => {
    expect(
      createUserSchema.safeParse({ ...base, department: "not_a_department" }).success,
    ).toBe(false);
  });

  it("covers the whole EmployeeDepartment union, so a new one cannot be forgotten", () => {
    const known: EmployeeDepartment[] = [
      "concierge", "finance", "tech", "shop", "house",
      "legacy", "marketing", "onboarding", "watcher", "academy",
    ];
    expect([...ALL_DEPARTMENTS].sort()).toEqual([...known].sort());
  });

  it("requires a password only when the invite email is declined", () => {
    // send_invite false = admin sets a temporary password directly.
    expect(
      createUserSchema.safeParse({ ...base, department: "academy", send_invite: false }).success,
    ).toBe(false);
    expect(
      createUserSchema.safeParse({
        ...base, department: "academy", send_invite: false, password: "TempPassw0rd!23",
      }).success,
    ).toBe(true);
  });

  it("treats an empty password string as absent on the invite path", () => {
    // The field stays registered as "" when it unmounts; without the preprocess
    // that tripped the 12-character minimum on a flow that needs no password.
    expect(
      createUserSchema.safeParse({ ...base, department: "academy", password: "" }).success,
    ).toBe(true);
  });
});
