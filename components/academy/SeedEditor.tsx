"use client";

/**
 * SeedEditor — the trainer-only scenario seed authoring surface.
 *
 * Seeds are the source material for every Academy session: the client persona
 * model reads `opening_message` + `hidden_constraints`, and the evaluator reads
 * `escalation_trigger` + `ideal_outcome`. They are therefore *secret* rows that
 * interns never see — and, critically, they must contain ONLY synthetic data.
 *
 * A trainer pasting a real Freshdesk ticket into a seed would push real member
 * PII into an LLM prompt. That is the named pre-mortem risk this screen guards
 * against: `scanSeedForPII` runs live as the trainer types and blocks submit,
 * and the server action re-runs the same scan authoritatively on save.
 *
 * Design: Atlas tokens only — zero hardcoded hex in this file.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Info,
  Layers,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createSeed, updateSeed, toggleSeedActive } from "@/lib/actions/academy";
import { DEFAULT_RUBRIC_WEIGHTS } from "@/lib/academy/rubric";
import { scanSeedForPII } from "@/lib/academy/pii";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { cn, formatDate } from "@/lib/utils";
import {
  ACADEMY_DIFFICULTIES,
  ACADEMY_VERTICALS,
  type AcademyDifficulty,
  type AcademyRubricWeights,
  type AcademyVertical,
  type ScenarioSeed,
} from "@/lib/types/database";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Always exactly the server action's input shape — no drift possible. */
type SeedActionInput = Parameters<typeof createSeed>[0];

/** A hidden constraint under edit. `key` is a render-stable React key only. */
interface ConstraintDraft {
  key: string;
  id: string;
  label: string;
  reveal_when: string;
  value: string;
}

interface SeedDraft {
  title: string;
  archetype: string;
  vertical: AcademyVertical;
  difficulty: AcademyDifficulty;
  opening_message: string;
  escalation_trigger: string;
  ideal_outcome: string;
  hidden_constraints: ConstraintDraft[];
  is_active: boolean;
  /** Preserved verbatim on edit; DEFAULT_RUBRIC_WEIGHTS on create. */
  rubric_weights: Record<string, number>;
}

type FieldErrors = Partial<Record<string, string>>;

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CONSTRAINTS = 8;

const LIMITS = {
  title: 160,
  archetype: 160,
  opening_message: 2000,
  escalation_trigger: 1000,
  ideal_outcome: 1000,
  constraintId: 60,
  constraintLabel: 120,
  constraintRevealWhen: 400,
  constraintValue: 600,
} as const;

const DIFFICULTY_TONE: Record<AcademyDifficulty, string> = {
  easy: "border-success/25 bg-success-light text-success",
  medium: "border-warning/30 bg-warning-light text-warning",
  hard: "border-danger/25 bg-danger-light text-danger",
};

const DIFFICULTY_LABEL: Record<AcademyDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const NATIVE_SELECT_CLASS = [
  "h-9 w-full rounded-md border border-surface-border bg-white px-3 text-sm text-brand-black",
  "transition-colors focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/25",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Stable, human-readable constraint id derived from its label. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.constraintId);
}

/**
 * Preserve whatever weights the seed already carries, defaulting any missing or
 * malformed dimension back to the house default. Returns a plain
 * `Record<string, number>` so it satisfies the action schema under strict TS.
 */
function normalizeWeights(
  weights: AcademyRubricWeights | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = { ...DEFAULT_RUBRIC_WEIGHTS };
  if (weights) {
    for (const [key, value] of Object.entries(weights)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        out[key] = value;
      }
    }
  }
  return out;
}

function emptyDraft(): SeedDraft {
  return {
    title: "",
    archetype: "",
    vertical: "Global",
    difficulty: "medium",
    opening_message: "",
    escalation_trigger: "",
    ideal_outcome: "",
    hidden_constraints: [
      { key: makeKey(), id: "", label: "", reveal_when: "", value: "" },
    ],
    is_active: true,
    rubric_weights: { ...DEFAULT_RUBRIC_WEIGHTS },
  };
}

function draftFromSeed(seed: ScenarioSeed): SeedDraft {
  return {
    title: seed.title,
    archetype: seed.archetype,
    vertical: seed.vertical,
    difficulty: seed.difficulty,
    opening_message: seed.opening_message,
    escalation_trigger: seed.escalation_trigger,
    ideal_outcome: seed.ideal_outcome,
    hidden_constraints: (seed.hidden_constraints ?? []).map((c) => ({
      key: makeKey(),
      id: c.id,
      label: c.label,
      reveal_when: c.reveal_when,
      value: c.value,
    })),
    is_active: seed.is_active,
    rubric_weights: normalizeWeights(seed.rubric_weights),
  };
}

function toActionInput(draft: SeedDraft): SeedActionInput {
  return {
    title: draft.title.trim(),
    archetype: draft.archetype.trim(),
    vertical: draft.vertical,
    difficulty: draft.difficulty,
    opening_message: draft.opening_message.trim(),
    escalation_trigger: draft.escalation_trigger.trim(),
    ideal_outcome: draft.ideal_outcome.trim(),
    hidden_constraints: draft.hidden_constraints.map((c) => ({
      id: c.id.trim(),
      label: c.label.trim(),
      reveal_when: c.reveal_when.trim(),
      value: c.value.trim(),
    })),
    rubric_weights: draft.rubric_weights,
    is_active: draft.is_active,
  };
}

function validate(draft: SeedDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.title.trim()) errors.title = "Title is required.";
  if (!draft.archetype.trim()) errors.archetype = "Archetype is required.";
  if (!draft.opening_message.trim()) {
    errors.opening_message = "The client has to open with something.";
  }
  if (!draft.escalation_trigger.trim()) {
    errors.escalation_trigger = "Describe what makes this escalate.";
  }
  if (!draft.ideal_outcome.trim()) {
    errors.ideal_outcome = "Describe what a great handling looks like.";
  }
  if (draft.hidden_constraints.length > MAX_CONSTRAINTS) {
    errors.hidden_constraints = `A scenario may carry at most ${MAX_CONSTRAINTS} hidden constraints.`;
  }
  draft.hidden_constraints.forEach((c, i) => {
    const filled = [c.id, c.label, c.reveal_when, c.value].map((v) => v.trim());
    if (filled.some((v) => !v)) {
      errors[`constraint-${c.key}`] =
        `Constraint ${i + 1} needs an id, a label, a reveal condition and a value.`;
    }
  });
  const ids = draft.hidden_constraints.map((c) => c.id.trim()).filter(Boolean);
  if (new Set(ids).size !== ids.length) {
    errors.hidden_constraints = "Constraint ids must be unique within a scenario.";
  }
  return errors;
}

// ── Small presentational pieces ───────────────────────────────────────────────

function Chip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[10px] font-semibold uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </span>
  );
}

function PiiPanel({
  issues,
  heading,
  detail,
}: {
  issues: string[];
  heading: string;
  detail: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16 }}
      className="rounded-lg border border-danger/30 bg-danger-light p-3.5"
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-danger">{heading}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-black/65">{detail}</p>
          <ul className="mt-2 space-y-1">
            {issues.map((issue, i) => (
              <li
                key={`${issue}-${i}`}
                className="flex gap-1.5 text-[12px] leading-relaxed text-black/75"
              >
                <span className="text-danger" aria-hidden>
                  •
                </span>
                <span className="min-w-0 break-words">{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

/** The unmissable, always-on synthetic-data rule. */
function SyntheticDataBanner() {
  return (
    <div className="overflow-hidden rounded-xl border border-warning/35 bg-warning-light shadow-card">
      <div className="flex items-start gap-3.5 border-l-4 border-l-warning p-4 sm:p-5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15">
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-base tracking-tight text-brand-black sm:text-[17px]">
            Synthetic scenarios only — never paste a real ticket
          </h2>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-black/70">
            Every word of a seed is sent to a language model. Do not copy from
            Freshdesk, WhatsApp, or any live member record. No real member names,
            phone numbers, email addresses, booking or invoice references, links,
            or social handles — invent them all. Write the situation, not the
            person.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-black/55">
            Drafts are scanned as you type, and the server re-checks on save. A
            seed that trips the scan cannot be stored.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── The authoring form (rendered inside the sheet, keyed per seed) ─────────────

interface SeedFormProps {
  seed: ScenarioSeed | null;
  onDirtyChange: (dirty: boolean) => void;
  onDone: () => void;
}

function SeedForm({ seed, onDirtyChange, onDone }: SeedFormProps) {
  const router = useRouter();
  const isEdit = seed !== null;

  const [draft, setDraft] = useState<SeedDraft>(() =>
    seed ? draftFromSeed(seed) : emptyDraft(),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverPiiIssues, setServerPiiIssues] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  // ── Live PII scan (debounced on a serialized snapshot of the text fields) ──
  const scanKey = useMemo(
    () =>
      JSON.stringify({
        title: draft.title,
        archetype: draft.archetype,
        opening_message: draft.opening_message,
        escalation_trigger: draft.escalation_trigger,
        ideal_outcome: draft.ideal_outcome,
        hidden_constraints: draft.hidden_constraints.map((c) => ({
          label: c.label,
          reveal_when: c.reveal_when,
          value: c.value,
        })),
      }),
    [draft],
  );
  const debouncedScanKey = useDebounce(scanKey, 320);
  const livePiiIssues = useMemo(
    () => scanSeedForPII(JSON.parse(debouncedScanKey) as Parameters<typeof scanSeedForPII>[0]),
    [debouncedScanKey],
  );

  // ── Dirty tracking so an accidental close cannot destroy a long draft ──────
  const baselineKey = useMemo(
    () => JSON.stringify(toActionInput(seed ? draftFromSeed(seed) : emptyDraft())),
    [seed],
  );
  const currentKey = useMemo(() => JSON.stringify(toActionInput(draft)), [draft]);
  const dirty = currentKey !== baselineKey;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // ── Field mutators ────────────────────────────────────────────────────────
  const setField = useCallback(
    <K extends keyof SeedDraft>(key: K, value: SeedDraft[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        if (!prev[key as string]) return prev;
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
      setServerPiiIssues([]);
    },
    [],
  );

  const patchConstraint = useCallback(
    (key: string, patch: Partial<Omit<ConstraintDraft, "key">>) => {
      setDraft((prev) => ({
        ...prev,
        hidden_constraints: prev.hidden_constraints.map((c) =>
          c.key === key ? { ...c, ...patch } : c,
        ),
      }));
      setErrors((prev) => {
        if (!prev[`constraint-${key}`] && !prev.hidden_constraints) return prev;
        const next = { ...prev };
        delete next[`constraint-${key}`];
        delete next.hidden_constraints;
        return next;
      });
      setServerPiiIssues([]);
    },
    [],
  );

  const addConstraint = useCallback(() => {
    setDraft((prev) =>
      prev.hidden_constraints.length >= MAX_CONSTRAINTS
        ? prev
        : {
            ...prev,
            hidden_constraints: [
              ...prev.hidden_constraints,
              { key: makeKey(), id: "", label: "", reveal_when: "", value: "" },
            ],
          },
    );
  }, []);

  const removeConstraint = useCallback((key: string) => {
    setDraft((prev) => ({
      ...prev,
      hidden_constraints: prev.hidden_constraints.filter((c) => c.key !== key),
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`constraint-${key}`];
      delete next.hidden_constraints;
      return next;
    });
  }, []);

  /** Fill a blank constraint id from its label so trainers never hand-slug. */
  const autofillConstraintId = useCallback((key: string) => {
    setDraft((prev) => ({
      ...prev,
      hidden_constraints: prev.hidden_constraints.map((c) =>
        c.key === key && !c.id.trim() && c.label.trim()
          ? { ...c, id: slugify(c.label) }
          : c,
      ),
    }));
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────
  const blocked = livePiiIssues.length > 0;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    if (blocked) {
      toast.error("Resolve the flagged personal data before saving.");
      return;
    }

    const nextErrors = validate(draft);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error("Some fields still need attention.");
      return;
    }
    setErrors({});

    // Belt and braces: scan the exact trimmed payload, not just the debounced snapshot.
    const payload = toActionInput(draft);
    const finalIssues = scanSeedForPII(payload);
    if (finalIssues.length > 0) {
      setServerPiiIssues(finalIssues);
      toast.error("Possible personal data detected — seeds must be synthetic.");
      return;
    }

    startTransition(async () => {
      const result = seed
        ? await updateSeed(seed.id, payload)
        : await createSeed(payload);

      if (!result.success) {
        if (result.piiIssues && result.piiIssues.length > 0) {
          setServerPiiIssues(result.piiIssues);
        }
        toast.error(result.error);
        return;
      }

      toast.success(
        seed ? "Scenario updated." : "Scenario created and added to the library.",
      );
      setServerPiiIssues([]);
      onDirtyChange(false);
      onDone();
      router.refresh();
    });
  };

  const constraintCount = draft.hidden_constraints.length;

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <SheetBody className="space-y-5">
        <AnimatePresence initial={false}>
          {livePiiIssues.length > 0 && (
            <PiiPanel
              key="live-pii"
              issues={livePiiIssues}
              heading="Possible real / personal data in this draft"
              detail="Saving is blocked until these are replaced with invented details."
            />
          )}
          {serverPiiIssues.length > 0 && livePiiIssues.length === 0 && (
            <PiiPanel
              key="server-pii"
              issues={serverPiiIssues}
              heading="Rejected by the server check"
              detail="The server re-scans every seed and is the authority. Edit the flagged text and save again."
            />
          )}
        </AnimatePresence>

        {/* ── Identity ────────────────────────────────────────────────── */}
        <section className="space-y-4">
          <IndulgeField
            label="Title"
            htmlFor="seed-title"
            required
            error={errors.title}
            hint="What a trainer sees in the library and an intern sees on the scenario card."
          >
            <Input
              id="seed-title"
              value={draft.title}
              maxLength={LIMITS.title}
              placeholder="Late jet transfer, Milan"
              error={Boolean(errors.title)}
              onChange={(e) => setField("title", e.target.value)}
            />
          </IndulgeField>

          <IndulgeField
            label="Archetype"
            htmlFor="seed-archetype"
            required
            error={errors.archetype}
            hint="The kind of client and request — steers the persona model's voice."
          >
            <Input
              id="seed-archetype"
              value={draft.archetype}
              maxLength={LIMITS.archetype}
              placeholder="Time-poor principal, tolerant of cost, intolerant of vagueness"
              error={Boolean(errors.archetype)}
              onChange={(e) => setField("archetype", e.target.value)}
            />
          </IndulgeField>

          <div className="grid gap-4 sm:grid-cols-2">
            <IndulgeField label="Vertical" htmlFor="seed-vertical" required>
              <select
                id="seed-vertical"
                className={NATIVE_SELECT_CLASS}
                value={draft.vertical}
                onChange={(e) =>
                  setField("vertical", e.target.value as AcademyVertical)
                }
              >
                {ACADEMY_VERTICALS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </IndulgeField>

            <IndulgeField label="Difficulty" htmlFor="seed-difficulty" required>
              <select
                id="seed-difficulty"
                className={NATIVE_SELECT_CLASS}
                value={draft.difficulty}
                onChange={(e) =>
                  setField("difficulty", e.target.value as AcademyDifficulty)
                }
              >
                {ACADEMY_DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABEL[d]}
                  </option>
                ))}
              </select>
            </IndulgeField>
          </div>
        </section>

        <div className="h-px bg-surface-border" />

        {/* ── Opening message ─────────────────────────────────────────── */}
        <section className="space-y-2">
          <IndulgeField
            label="Opening message"
            htmlFor="seed-opening"
            required
            error={errors.opening_message}
          >
            <Textarea
              id="seed-opening"
              value={draft.opening_message}
              maxLength={LIMITS.opening_message}
              className="min-h-[120px]"
              placeholder="Hi — I land in Milan on {{date}} and the car that was meant to meet me has gone quiet. Can you sort it?"
              onChange={(e) => setField("opening_message", e.target.value)}
            />
          </IndulgeField>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-black/55">
              <Sparkles className="h-3 w-3 shrink-0 text-brand-gold" aria-hidden />
              <span>
                <code className="rounded bg-surface-subtle px-1 py-0.5 font-mono text-[10px] text-brand-gold-dark">
                  {"{{name}}"}
                </code>{" "}
                and{" "}
                <code className="rounded bg-surface-subtle px-1 py-0.5 font-mono text-[10px] text-brand-gold-dark">
                  {"{{date}}"}
                </code>{" "}
                are randomised per session, so no two interns get the same run.
              </span>
            </p>
            <span className="text-[11px] tabular-nums text-black/40">
              {draft.opening_message.length} / {LIMITS.opening_message}
            </span>
          </div>
        </section>

        <div className="h-px bg-surface-border" />

        {/* ── Hidden constraints ──────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-serif text-[15px] tracking-tight text-brand-black">
                Hidden constraints
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-black/60">
                The facts the client withholds. The persona only volunteers a
                constraint&apos;s <span className="font-medium">value</span> once
                the intern asks something matching its{" "}
                <span className="font-medium">reveal when</span> description — so
                write the probe you want to reward, not the answer.
              </p>
            </div>
            <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-black/40">
              {constraintCount} / {MAX_CONSTRAINTS}
            </span>
          </div>

          {errors.hidden_constraints && (
            <p className="text-[11px] leading-tight text-danger" role="alert">
              {errors.hidden_constraints}
            </p>
          )}

          <AnimatePresence initial={false}>
            {draft.hidden_constraints.map((constraint, index) => (
              <motion.div
                key={constraint.key}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.16 }}
                className="rounded-lg border border-surface-border bg-surface-subtle/50 p-3.5"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-black/45">
                    Constraint {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove constraint ${index + 1}`}
                    onClick={() => removeConstraint(constraint.key)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <IndulgeField
                    label="Label"
                    htmlFor={`constraint-label-${constraint.key}`}
                    hint="Short internal name."
                  >
                    <Input
                      id={`constraint-label-${constraint.key}`}
                      size="sm"
                      value={constraint.label}
                      maxLength={LIMITS.constraintLabel}
                      placeholder="Dietary restriction"
                      onChange={(e) =>
                        patchConstraint(constraint.key, { label: e.target.value })
                      }
                      onBlur={() => autofillConstraintId(constraint.key)}
                    />
                  </IndulgeField>

                  <IndulgeField
                    label="Id"
                    htmlFor={`constraint-id-${constraint.key}`}
                    hint="Stable slug — auto-filled from the label."
                  >
                    <Input
                      id={`constraint-id-${constraint.key}`}
                      size="sm"
                      value={constraint.id}
                      maxLength={LIMITS.constraintId}
                      placeholder="dietary-restriction"
                      className="font-mono"
                      onChange={(e) =>
                        patchConstraint(constraint.key, { id: e.target.value })
                      }
                    />
                  </IndulgeField>
                </div>

                <div className="mt-3 grid gap-3">
                  <IndulgeField
                    label="Reveal when"
                    htmlFor={`constraint-reveal-${constraint.key}`}
                    hint="Describe the probe that unlocks the value below."
                  >
                    <Textarea
                      id={`constraint-reveal-${constraint.key}`}
                      value={constraint.reveal_when}
                      maxLength={LIMITS.constraintRevealWhen}
                      className="min-h-[64px] text-[13px]"
                      placeholder="The intern asks about allergies, dietary needs, or anything the party cannot eat."
                      onChange={(e) =>
                        patchConstraint(constraint.key, {
                          reveal_when: e.target.value,
                        })
                      }
                    />
                  </IndulgeField>

                  <IndulgeField
                    label="Value"
                    htmlFor={`constraint-value-${constraint.key}`}
                    hint="What the client says once unlocked. Invented details only."
                  >
                    <Textarea
                      id={`constraint-value-${constraint.key}`}
                      value={constraint.value}
                      maxLength={LIMITS.constraintValue}
                      className="min-h-[64px] text-[13px]"
                      placeholder="Two of the six guests are strictly shellfish-free, and one does not eat dairy."
                      onChange={(e) =>
                        patchConstraint(constraint.key, { value: e.target.value })
                      }
                    />
                  </IndulgeField>
                </div>

                {errors[`constraint-${constraint.key}`] && (
                  <p className="mt-2 text-[11px] leading-tight text-danger" role="alert">
                    {errors[`constraint-${constraint.key}`]}
                  </p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {constraintCount === 0 && (
            <p className="rounded-lg border border-dashed border-surface-border px-3.5 py-4 text-center text-[12px] text-black/45">
              No hidden constraints — the intern will have nothing to uncover.
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addConstraint}
            disabled={constraintCount >= MAX_CONSTRAINTS}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add constraint
          </Button>
        </section>

        <div className="h-px bg-surface-border" />

        {/* ── Evaluator inputs ────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info-light px-3.5 py-2.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" aria-hidden />
            <p className="text-[12px] leading-relaxed text-black/65">
              These two fields are read by the evaluator, never by the client
              persona. They define what &ldquo;handled well&rdquo; means for this
              scenario.
            </p>
          </div>

          <IndulgeField
            label="Escalation trigger"
            htmlFor="seed-escalation"
            required
            error={errors.escalation_trigger}
            hint="What turns this from routine into urgent, and how fast the intern should notice."
          >
            <Textarea
              id="seed-escalation"
              value={draft.escalation_trigger}
              maxLength={LIMITS.escalation_trigger}
              className="min-h-[90px]"
              placeholder="If the intern has not offered a concrete alternative within three exchanges, the client states the meeting is now at risk."
              onChange={(e) => setField("escalation_trigger", e.target.value)}
            />
          </IndulgeField>

          <IndulgeField
            label="Ideal outcome"
            htmlFor="seed-outcome"
            required
            error={errors.ideal_outcome}
            hint="The gold-standard handling the intern is scored against."
          >
            <Textarea
              id="seed-outcome"
              value={draft.ideal_outcome}
              maxLength={LIMITS.ideal_outcome}
              className="min-h-[90px]"
              placeholder="Acknowledges within one message, probes for the arrival window, offers two vetted alternatives without inventing availability, and confirms the next update time."
              onChange={(e) => setField("ideal_outcome", e.target.value)}
            />
          </IndulgeField>

          <label className="flex items-center justify-between gap-4 rounded-lg border border-surface-border bg-white px-3.5 py-3">
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-brand-black">
                Active in the library
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-black/55">
                Inactive scenarios stay authored but are hidden from the intern
                picker.
              </span>
            </span>
            <Switch
              checked={draft.is_active}
              onCheckedChange={(checked) => setField("is_active", checked)}
              aria-label="Active in the library"
              className="data-[state=checked]:bg-brand-gold"
            />
          </label>
        </section>
      </SheetBody>

      <SheetFooter className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] leading-tight text-black/45">
          {blocked
            ? "Saving is blocked while personal data is flagged."
            : "Rubric weights use the house default and are preserved on edit."}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDone}
            disabled={isPending}
          >
            Cancel
          </Button>
          <IndulgeButton
            type="submit"
            variant="gold"
            size="sm"
            loading={isPending}
            disabled={blocked}
          >
            {isEdit ? "Save scenario" : "Create scenario"}
          </IndulgeButton>
        </div>
      </SheetFooter>
    </form>
  );
}

// ── The screen ────────────────────────────────────────────────────────────────

export function SeedEditor({ seeds }: { seeds: ScenarioSeed[] }) {
  const router = useRouter();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ScenarioSeed | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  /** Optimistic active flags, reconciled whenever fresh props arrive. */
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});
  const [, startToggleTransition] = useTransition();

  useEffect(() => {
    setActiveOverrides({});
  }, [seeds]);

  const isActive = useCallback(
    (seed: ScenarioSeed) => activeOverrides[seed.id] ?? seed.is_active,
    [activeOverrides],
  );

  const grouped = useMemo(() => {
    const buckets = new Map<AcademyVertical, ScenarioSeed[]>();
    for (const vertical of ACADEMY_VERTICALS) buckets.set(vertical, []);
    for (const seed of seeds) {
      const bucket = buckets.get(seed.vertical);
      if (bucket) bucket.push(seed);
      else buckets.set(seed.vertical, [seed]);
    }
    return ACADEMY_VERTICALS.map((vertical) => ({
      vertical,
      rows: [...(buckets.get(vertical) ?? [])].sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
    })).filter((group) => group.rows.length > 0);
  }, [seeds]);

  const activeCount = useMemo(
    () => seeds.filter((s) => isActive(s)).length,
    [seeds, isActive],
  );

  const openCreate = () => {
    setEditing(null);
    setFormDirty(false);
    setSheetOpen(true);
  };

  const openEdit = (seed: ScenarioSeed) => {
    setEditing(seed);
    setFormDirty(false);
    setSheetOpen(true);
  };

  const closeSheet = useCallback(() => {
    setFormDirty(false);
    setSheetOpen(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSheetOpen(true);
      return;
    }
    if (formDirty && !window.confirm("Discard unsaved changes to this scenario?")) {
      return;
    }
    closeSheet();
  };

  const handleToggle = (seed: ScenarioSeed, next: boolean) => {
    setTogglingId(seed.id);
    setActiveOverrides((prev) => ({ ...prev, [seed.id]: next }));

    startToggleTransition(async () => {
      const result = await toggleSeedActive(seed.id, next);
      setTogglingId(null);

      if (!result.success) {
        setActiveOverrides((prev) => {
          const revert = { ...prev };
          delete revert[seed.id];
          return revert;
        });
        toast.error(result.error);
        return;
      }

      toast.success(
        next
          ? `"${seed.title}" is live in the intern picker.`
          : `"${seed.title}" is hidden from the intern picker.`,
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <SyntheticDataBanner />

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-xl tracking-tight text-brand-black">
            Scenario library
          </h1>
          <p className="mt-1 text-[13px] text-black/55">
            {seeds.length === 0
              ? "No scenarios authored yet."
              : `${seeds.length} scenario${seeds.length === 1 ? "" : "s"} · ${activeCount} active · ${
                  seeds.length - activeCount
                } hidden`}
          </p>
        </div>
        <IndulgeButton
          variant="gold"
          leftIcon={<Plus className="h-4 w-4" aria-hidden />}
          onClick={openCreate}
        >
          New scenario
        </IndulgeButton>
      </div>

      {/* ── Grouped list ────────────────────────────────────────────── */}
      {seeds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-white/60 px-6 py-14 text-center">
          <Layers className="mx-auto h-6 w-6 text-taupe" aria-hidden />
          <p className="mt-3 font-serif text-[15px] text-brand-black">
            The library is empty
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-black/55">
            Author the first scenario to give interns something to practise on.
            Keep every detail invented.
          </p>
          <div className="mt-5">
            <IndulgeButton
              variant="gold"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden />}
              onClick={openCreate}
            >
              New scenario
            </IndulgeButton>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.vertical} className="space-y-2">
              <div className="flex items-center gap-2.5">
                <h2 className="font-serif text-[15px] tracking-tight text-brand-black">
                  {group.vertical}
                </h2>
                <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium tabular-nums text-black/50">
                  {group.rows.length}
                </span>
                <span className="h-px flex-1 bg-surface-border" aria-hidden />
              </div>

              <ul className="divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border bg-white shadow-card">
                {group.rows.map((seed) => {
                  const active = isActive(seed);
                  const constraintCount = seed.hidden_constraints?.length ?? 0;
                  return (
                    <li
                      key={seed.id}
                      className={cn(
                        "flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3.5 transition-colors",
                        "hover:bg-surface-subtle/60",
                        !active && "bg-surface-subtle/40",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "truncate font-serif text-[15px] tracking-tight text-brand-black",
                              !active && "text-black/50",
                            )}
                          >
                            {seed.title}
                          </span>
                          <Chip className={DIFFICULTY_TONE[seed.difficulty]}>
                            {DIFFICULTY_LABEL[seed.difficulty]}
                          </Chip>
                          <Chip className="border-surface-border bg-surface-subtle text-black/55">
                            {constraintCount} constraint
                            {constraintCount === 1 ? "" : "s"}
                          </Chip>
                          {!active && (
                            <Chip className="border-taupe/40 bg-surface-subtle text-taupe">
                              Hidden
                            </Chip>
                          )}
                        </div>
                        <p className="mt-1 truncate text-[13px] text-black/55">
                          {seed.archetype}
                        </p>
                        <p className="mt-0.5 text-[11px] text-black/35">
                          Updated {formatDate(seed.updated_at)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(seed)}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          Edit
                        </Button>
                        <Switch
                          checked={active}
                          disabled={togglingId === seed.id}
                          onCheckedChange={(next) => handleToggle(seed, next)}
                          aria-label={`${active ? "Deactivate" : "Activate"} ${seed.title}`}
                          className="data-[state=checked]:bg-brand-gold"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* ── Authoring sheet ─────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={handleOpenChange}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="font-serif tracking-tight">
              {editing ? "Edit scenario" : "New scenario"}
            </SheetTitle>
            <SheetDescription>
              {editing
                ? "Changes apply to every session started from here on. Existing sessions keep the snapshot they were started with."
                : "Invent the situation end to end. Nothing here may come from a real member, ticket or conversation."}
            </SheetDescription>
          </SheetHeader>

          {sheetOpen && (
            <SeedForm
              key={editing?.id ?? "new-seed"}
              seed={editing}
              onDirtyChange={setFormDirty}
              onDone={closeSheet}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
