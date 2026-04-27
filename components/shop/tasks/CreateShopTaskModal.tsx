"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogPortal,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IndulgeField } from "@/components/ui/indulge-field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { cn } from "@/lib/utils";

import { Check, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import {
  createShopTask,
  getShopAssigneeProfiles,
  type ShopAssigneeOption,
} from "@/lib/actions/shop-tasks";
import type { ShopMasterTargetPriority } from "@/lib/types/database";

const formSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(500),
    notes: z.string().max(5000).optional(),
    shop_operation_scope: z.enum(["individual", "group"]),
    assigned_to_users: z.array(z.string().uuid()).min(1, "Select at least one agent"),
    dueAt: z.coerce.date(),
    shop_task_priority: z.enum(["super_high", "high", "normal"]),
    has_target: z.boolean(),
    target_inventory: z.preprocess(
      (v) => {
        if (v === "" || v === undefined || v === null) return undefined;
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : undefined;
      },
      z.number().int().nonnegative().optional(),
    ),
    shop_product_name: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.shop_operation_scope === "individual" && data.assigned_to_users.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Pick exactly one agent for an individual task.",
        path: ["assigned_to_users"],
      });
    }
    if (data.shop_operation_scope === "group" && data.assigned_to_users.length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "Group tasks need at least two agents.",
        path: ["assigned_to_users"],
      });
    }
    if (data.has_target) {
      if (data.target_inventory == null || data.target_inventory < 1) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a target amount.",
          path: ["target_inventory"],
        });
      }
      if (!data.shop_product_name?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Product name is required.",
          path: ["shop_product_name"],
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

const STEPS = 2;

function PrioritySegment({
  value,
  onChange,
}: {
  value: ShopMasterTargetPriority;
  onChange: (v: ShopMasterTargetPriority) => void;
}) {
  const opts: { id: ShopMasterTargetPriority; label: string; dot?: string }[] = [
    { id: "super_high", label: "Super High", dot: "bg-rose-500" },
    { id: "high", label: "High", dot: "bg-amber-500" },
    { id: "normal", label: "Normal", dot: "bg-stone-400" },
  ];
  return (
    <div className="inline-flex w-full rounded-lg bg-[#F2F2EE] p-1 text-[#6B6B6B] gap-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[11px] font-medium transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/50",
            value === o.id
              ? "bg-white text-[#1A1A1A] shadow-sm"
              : "text-[#6B6B6B] hover:text-[#1A1A1A]",
          )}
        >
          {o.dot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", o.dot)} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface CreateShopTaskModalProps {
  trigger?: React.ReactNode;
}

export function CreateShopTaskModal({ trigger }: CreateShopTaskModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [agents, setAgents] = useState<ShopAssigneeOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const defaultDue = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(18, 0, 0, 0);
    return d;
  }, []);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    getValues,
    trigger: triggerValidation,
    formState: { errors },
  } = useForm<FormValues>({
    shouldUnregister: false,
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      title: "",
      notes: "",
      shop_operation_scope: "individual",
      assigned_to_users: [],
      dueAt: defaultDue,
      shop_task_priority: "normal",
      has_target: false,
      target_inventory: undefined,
      shop_product_name: "",
    },
  });

  const scope = watch("shop_operation_scope");
  const hasTarget = watch("has_target");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      void getShopAssigneeProfiles().then(setAgents);
      // Default assignee = current user (so it shows in "My ongoing tasks")
      void createClient()
        .auth.getUser()
        .then(({ data }: { data: { user: { id: string } | null } }) => {
          const uid = data.user?.id;
          if (!uid) return;
          const current = getValues("assigned_to_users") ?? [];
          if (current.length === 0) setValue("assigned_to_users", [uid], { shouldDirty: true });
        });
    }
  }, [open, getValues, setValue]);

  function handleOpenChange(v: boolean) {
    if (!v) {
      reset();
      setStep(1);
      setServerError(null);
    }
    setOpen(v);
  }

  async function nextStep() {
    setServerError(null);
    if (step === 1) {
      const ok = await triggerValidation(["title", "shop_operation_scope", "assigned_to_users"]);
      if (ok) setStep(2);
      return;
    }
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await createShopTask(undefined, {
        title: values.title,
        notes: values.notes?.trim() || null,
        shop_operation_scope: values.shop_operation_scope,
        assigned_to_users: values.assigned_to_users,
        dueAt: values.dueAt,
        shop_task_priority: values.shop_task_priority,
        has_target: values.has_target,
        target_inventory: values.has_target ? values.target_inventory : null,
        shop_product_name: values.has_target ? values.shop_product_name?.trim() : null,
      });
      if (!res.success) {
        setServerError(res.error ?? "Failed to create task");
        return;
      }
      handleOpenChange(false);
      // Stay on the workspace; refresh lists instead of auto-opening the war room.
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  // Prevent Radix Dialog SSR hydration mismatches (dynamic aria-controls ids).
  // On the server + first client render, we emit only the trigger markup.
  if (!mounted) {
    return (
      trigger ?? (
        <Button type="button" variant="outline" className="rounded-xl">
          New shop task
        </Button>
      )
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" className="rounded-xl">
            New shop task
          </Button>
        )}
      </DialogPrimitive.Trigger>

      <DialogPortal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-md" />
        <DialogPrimitive.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-2xl ring-1 ring-black/4 shadow-2xl rounded-2xl p-6 max-h-[90vh] flex flex-col"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <DialogTitle
                  className="text-stone-900 text-lg font-semibold tracking-tight"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  Shop operation
                </DialogTitle>
                <DialogDescription className="text-stone-500 text-xs mt-1">
                  Step {step} of {STEPS} — extend your existing task engine for WhatsApp & inventory
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-[#9E9E9E]"
                >
                  <X className="w-4 h-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </DialogClose>
            </div>

            <div className="flex gap-1 mb-6">
              {[1, 2].map((s) => (
                <div
                  key={s}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    s <= step ? "bg-stone-800" : "bg-stone-200",
                  )}
                />
              ))}
            </div>

            <form
              onSubmit={(e) => {
                // Never let the browser implicitly submit this wizard form.
                // Submission happens only via the explicit "Create task" button.
                e.preventDefault();
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const tag = (e.target as HTMLElement | null)?.tagName;
                if (tag === "TEXTAREA") return; // allow newline in notes
                // Treat Enter as "Next" until final step.
                if (step < STEPS) {
                  e.preventDefault();
                  void nextStep();
                }
              }}
              className="flex flex-col min-h-0 flex-1"
            >
              <div
                className={cn(step !== 1 && "hidden")}
                aria-hidden={step !== 1}
              >
                <motion.div
                  initial={{ opacity: 0, y: 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <Controller
                    name="shop_operation_scope"
                    control={control}
                    render={({ field }) => (
                      <div className="inline-flex w-full rounded-lg bg-[#F2F2EE] p-1 text-[#6B6B6B]">
                        {(["individual", "group"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => field.onChange(m)}
                            className={cn(
                              "flex-1 rounded-md px-3 py-2 text-sm font-medium capitalize transition-all",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/50",
                              field.value === m
                                ? "bg-white text-[#1A1A1A] shadow-sm"
                                : "text-[#6B6B6B] hover:text-[#1A1A1A]",
                            )}
                          >
                            {m === "individual" ? "Individual task" : "Group task"}
                          </button>
                        ))}
                      </div>
                    )}
                  />

                  <IndulgeField
                    label="Title"
                    error={errors.title?.message}
                    required
                  >
                    <Input
                      {...register("title")}
                      size="lg"
                      error={!!errors.title}
                      placeholder="e.g. VIP ticket push — Griffin event"
                      className="rounded-xl"
                    />
                  </IndulgeField>

                  <IndulgeField label="Notes">
                    <Textarea
                      {...register("notes")}
                      rows={2}
                      placeholder="Briefing for the team…"
                      className="min-h-0 rounded-xl"
                    />
                  </IndulgeField>

                  <IndulgeField
                    label="Agents"
                    error={errors.assigned_to_users?.message}
                  >
                    <Controller
                      name="assigned_to_users"
                      control={control}
                      render={({ field }) => (
                        <ScrollArea className="h-[160px] rounded-xl border border-[#E5E4DF] bg-[#FAFAF8] text-[#1A1A1A]">
                          <div className="p-2 space-y-1">
                            {agents.map((a) => {
                              const checked = field.value.includes(a.id);
                              return (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => {
                                    if (scope === "individual") {
                                      field.onChange(checked ? [] : [a.id]);
                                      return;
                                    }
                                    if (checked) {
                                      field.onChange(field.value.filter((id: string) => id !== a.id));
                                    } else {
                                      field.onChange([...field.value, a.id]);
                                    }
                                  }}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm transition-colors",
                                    "text-[#1A1A1A]",
                                    checked
                                      ? "bg-white font-medium text-[#1A1A1A] shadow-sm ring-1 ring-stone-200/90"
                                      : "bg-transparent hover:bg-white/90 text-[#1A1A1A]",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                      checked
                                        ? "bg-stone-900 border-stone-900 text-white"
                                        : "border-stone-400 bg-white",
                                    )}
                                  >
                                    {checked && <Check className="h-3 w-3 text-white" />}
                                  </span>
                                  <span className="min-w-0 truncate">{a.full_name}</span>
                                </button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      )}
                    />
                  </IndulgeField>
                </motion.div>
              </div>

              <div
                className={cn("space-y-4", step !== 2 && "hidden")}
                aria-hidden={step !== 2}
              >
                  <IndulgeField label="Priority">
                    <Controller
                      name="shop_task_priority"
                      control={control}
                      render={({ field }) => (
                        <PrioritySegment value={field.value} onChange={field.onChange} />
                      )}
                    />
                  </IndulgeField>

                  <IndulgeField label="Deadline" error={errors.dueAt?.message}>
                    <Controller
                      name="dueAt"
                      control={control}
                      render={({ field }) => (
                        <LuxuryDatePicker value={field.value} onChange={field.onChange} />
                      )}
                    />
                  </IndulgeField>
                  <div className="pt-2" />
                  <div className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2.5 bg-stone-50/50">
                    <span className="text-sm text-stone-700">Has target / inventory?</span>
                    <Controller
                      name="has_target"
                      control={control}
                      render={({ field }) => {
                        const on = Boolean(field.value);
                        return (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            onClick={() => field.onChange(!on)}
                            className={cn(
                              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                              on ? "bg-stone-900" : "bg-stone-300",
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                                on ? "translate-x-5" : "translate-x-0",
                              )}
                            />
                          </button>
                        );
                      }}
                    />
                  </div>
                  <div
                    className={cn("grid grid-cols-2 gap-3", !hasTarget && "hidden")}
                    aria-hidden={!hasTarget}
                  >
                    <IndulgeField
                      label="Product name"
                      error={errors.shop_product_name?.message}
                    >
                      <Input
                        {...register("shop_product_name")}
                        error={!!errors.shop_product_name}
                        placeholder="e.g. Griffin ticket"
                        className="rounded-xl"
                      />
                    </IndulgeField>

                    <IndulgeField
                      label="Target amount"
                      error={errors.target_inventory?.message}
                    >
                      <Input
                        type="number"
                        min={1}
                        {...register("target_inventory", { valueAsNumber: true })}
                        error={!!errors.target_inventory}
                        className="rounded-xl"
                      />
                    </IndulgeField>
                  </div>
              </div>

              {serverError && (
                <p className="text-sm text-rose-600 mt-2">{serverError}</p>
              )}

              <div className="flex justify-between gap-2 mt-6 pt-4 border-t border-stone-100">
                {step > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-xl"
                    onClick={() => setStep((s) => s - 1)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                {step < STEPS ? (
                  <Button
                    type="button"
                    onClick={() => void nextStep()}
                    className="rounded-xl"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleSubmit(onSubmit)()}
                    className="rounded-xl min-w-[120px]"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Create task"
                    )}
                  </Button>
                )}
              </div>
            </form>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
