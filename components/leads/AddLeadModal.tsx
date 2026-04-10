"use client";

import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogPortal, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, X, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  addLeadSchema,
  type AddLeadFormValues,
  LEAD_SOURCES,
  LEAD_DOMAINS,
} from "@/lib/schemas/lead";
import {
  createLead,
  getAgentsForLeadForm,
  getCurrentUserProfile,
} from "@/lib/actions/createLead";
import { cn } from "@/lib/utils";

type Agent = { id: string; full_name: string };

// ── Micro-components ───────────────────────────────────────

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <Label className="text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-widest">
      {children}
      {required && <span className="text-danger ml-0.5">*</span>}
    </Label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-[11px] text-danger mt-1"
    >
      {message}
    </motion.p>
  );
}

const inputCx = (hasError?: boolean) =>
  cn(
    "h-10 px-3.5 text-sm bg-white focus:ring-[#7A6652]/20 focus:border-[#7A6652]",
    hasError && "border-danger/50 focus:border-danger focus:ring-danger/15",
  );

const selectTriggerCx =
  "h-10 text-sm bg-white focus:ring-[#7A6652]/20 focus:border-[#7A6652] data-[state=open]:border-[#7A6652]";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "attempted", label: "Attempted" },
  { value: "connected", label: "Connected" },
  { value: "in_discussion", label: "In Discussion" },
  { value: "nurturing", label: "Nurturing" },
] as const;

// ── Section divider ────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[10px] font-semibold text-[#C0BDB5] uppercase tracking-[0.18em]">
        {children}
      </span>
      <div className="flex-1 h-px bg-[#EEEBE7]" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────

interface AddLeadModalProps {
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}

export function AddLeadModal({
  externalOpen,
  onExternalOpenChange,
}: AddLeadModalProps = {}) {
  const isControlled = externalOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);

  const open = isControlled ? externalOpen! : internalOpen;
  const setOpen = isControlled
    ? (v: boolean) => onExternalOpenChange?.(v)
    : setInternalOpen;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [callerRole, setCallerRole] = useState<string>("agent");
  const [serverError, setServerError] = useState<string | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AddLeadFormValues>({
    resolver: zodResolver(addLeadSchema),
    defaultValues: {
      full_name: "",
      phone: "",
      email: "",
      city: "",
      source: undefined,
      campaign_name: "",
      domain: "Indulge Global",
      status: "new",
      assigned_to: "",
      initial_notes: "",
    },
  });

  // On open: fetch caller role + agents list in parallel
  useEffect(() => {
    if (!open) return;
    let active = true;

    Promise.all([getCurrentUserProfile(), getAgentsForLeadForm()]).then(
      ([profile, agentList]) => {
        if (!active) return;
        setCallerRole(profile.role);
        setAgents(agentList);
        setAgentsLoading(false);
        // Scouts/Admins: default Assign To to self when left blank
        if (profile.role === "admin" || profile.role === "founder" || profile.role === "manager") {
          setValue("assigned_to", profile.id);
        }
      },
    );

    setAgentsLoading(true);

    return () => {
      active = false;
    };
  }, [open]);

  function handleClose() {
    if (isSubmitting) return;
    reset();
    setServerError(null);
    setOpen(false);
  }

  async function onSubmit(values: AddLeadFormValues) {
    setServerError(null);
    const result = await createLead(values);
    if (!result.success) {
      setServerError(result.error ?? "An unexpected error occurred.");
      return;
    }
    reset();
    setServerError(null);
    setOpen(false);
    router.refresh();
  }

  const isAgent = callerRole === "agent";
  const canAssign = callerRole === "admin" || callerRole === "founder" || callerRole === "manager";

  return (
    <>
      {/* ── Trigger Button ──────────────────────────────── */}
      {!isControlled && (
        <Button
          onClick={() => setOpen(true)}
          className="group gap-1.5 border border-transparent hover:border-brand-gold/35 hover:shadow-[0_0_16px_-3px_rgb(212_175_55/0.22)] transition-all duration-300"
        >
          <Plus className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-90" />
          Add New Lead
        </Button>
      )}

      {/* ── Dialog ─────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => !isSubmitting && setOpen(v)}>
        {open && (
          <DialogPortal>
            {/* Backdrop */}
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="fixed inset-0 z-50 bg-[#0A0A0A]/52 backdrop-blur-[3px]"
              />
            </DialogPrimitive.Overlay>

            {/* Panel */}
            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 8 }}
                transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.42 }}
                className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#F9F9F6] rounded-2xl shadow-[0_32px_64px_-12px_rgb(0_0_0/0.26),0_0_0_1px_rgb(0_0_0/0.05)] outline-none"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: "rgba(0,0,0,0.1) transparent",
                }}
              >
                {/* Close */}
                <DialogClose asChild>
                  <button
                    className="absolute right-4 top-4 z-10 p-1.5 rounded-full text-[#B0ADA8] hover:text-[#1A1A1A] hover:bg-black/[0.05] transition-colors duration-150"
                    disabled={isSubmitting}
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </DialogClose>

                <div className="p-7">
                  {/* ── Header ─────────────────────────── */}
                  <div className="flex items-start gap-4 mb-7">
                    <div className="w-11 h-11 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/18 flex items-center justify-center shrink-0 mt-0.5">
                      <UserPlus className="w-5 h-5 text-[#D4AF37]" />
                    </div>
                    <div>
                      <DialogPrimitive.Title
                        className="text-[22px] font-semibold text-[#1A1A1A] leading-tight tracking-tight"
                        style={{
                          fontFamily:
                            "var(--font-playfair), 'Playfair Display', Georgia, serif",
                        }}
                      >
                        Add New Lead
                      </DialogPrimitive.Title>
                      <DialogPrimitive.Description className="text-sm text-[#9E9E9E] mt-1 leading-relaxed">
                        Complete the details below to enter this lead into the
                        pipeline.
                      </DialogPrimitive.Description>
                    </div>
                  </div>

                  {/* ── Form ───────────────────────────── */}
                  <form onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="space-y-5">
                      {/* ── CONTACT DETAILS ────────────── */}
                      <SectionLabel>Contact Details</SectionLabel>

                      {/* Full Name */}
                      <div className="space-y-1.5">
                        <FieldLabel required>Full Name</FieldLabel>
                        <Input
                          placeholder="e.g. Layla Al-Rashidi"
                          autoComplete="name"
                          {...register("full_name")}
                          className={inputCx(!!errors.full_name)}
                        />
                        <FieldError message={errors.full_name?.message} />
                      </div>

                      {/* Phone + Email */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <FieldLabel required>Phone Number</FieldLabel>
                          <Input
                            type="tel"
                            placeholder="+971 50 123 4567"
                            autoComplete="tel"
                            {...register("phone")}
                            className={inputCx(!!errors.phone)}
                          />
                          <FieldError message={errors.phone?.message} />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Email Address</FieldLabel>
                          <Input
                            type="email"
                            placeholder="lead@example.com"
                            autoComplete="email"
                            {...register("email")}
                            className={inputCx(!!errors.email)}
                          />
                          <FieldError message={errors.email?.message} />
                        </div>
                      </div>

                      {/* City */}
                      <div className="space-y-1.5">
                        <FieldLabel>City</FieldLabel>
                        <Input
                          placeholder="e.g. Dubai"
                          {...register("city")}
                          className={inputCx()}
                        />
                      </div>

                      {/* ── CAMPAIGN INFO ───────────────── */}
                      <SectionLabel>Campaign & Attribution</SectionLabel>

                      {/* Source + Campaign Name */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <FieldLabel>Source</FieldLabel>
                          <Controller
                            control={control}
                            name="source"
                            render={({ field }) => (
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                              >
                                <SelectTrigger className={selectTriggerCx}>
                                  <SelectValue placeholder="Select source…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {LEAD_SOURCES.map((src) => (
                                    <SelectItem key={src} value={src}>
                                      {src}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Campaign Name</FieldLabel>
                          <Input
                            placeholder="e.g. Summer_Yacht_2026"
                            {...register("campaign_name")}
                            className={inputCx(!!errors.campaign_name)}
                          />
                          <FieldError message={errors.campaign_name?.message} />
                        </div>
                      </div>

                      {/* Domain + Status */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <FieldLabel required>Domain</FieldLabel>
                          <Controller
                            control={control}
                            name="domain"
                            render={({ field }) => (
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                              >
                                <SelectTrigger className={selectTriggerCx}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {LEAD_DOMAINS.map((d) => (
                                    <SelectItem key={d} value={d}>
                                      {d}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel required>Status</FieldLabel>
                          <Controller
                            control={control}
                            name="status"
                            render={({ field }) => (
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                              >
                                <SelectTrigger className={selectTriggerCx}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map((opt) => (
                                    <SelectItem
                                      key={opt.value}
                                      value={opt.value}
                                    >
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          <FieldError message={errors.status?.message} />
                        </div>
                      </div>

                      {/* ── ASSIGNMENT ─────────────────────
                           Only visible to scout / admin.
                           Agents are auto-assigned server-side.
                      ──────────────────────────────────────*/}
                      <AnimatePresence>
                        {canAssign && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <SectionLabel>Assignment</SectionLabel>
                            <div className="mt-5 space-y-1.5">
                              <FieldLabel>Assigned Agent</FieldLabel>
                              <Controller
                                control={control}
                                name="assigned_to"
                                render={({ field }) => (
                                  <Select
                                    disabled={agentsLoading}
                                    value={field.value}
                                    onValueChange={field.onChange}
                                  >
                                    <SelectTrigger className={selectTriggerCx}>
                                      <SelectValue
                                        placeholder={
                                          agentsLoading
                                            ? "Loading agents…"
                                            : "Assign to agent…"
                                        }
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {!agentsLoading && agents.length === 0 ? (
                                        <div className="px-2 py-4 text-center text-sm text-[#B0ADA8]">
                                          No active agents found
                                        </div>
                                      ) : (
                                        agents.map((agent) => (
                                          <SelectItem
                                            key={agent.id}
                                            value={agent.id}
                                          >
                                            {agent.full_name}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Agent self-assignment whisper */}
                      {isAgent && (
                        <p className="text-[11px] text-[#C0BDB5] leading-relaxed">
                          This lead will be assigned to you automatically.
                        </p>
                      )}

                      {/* ── NOTES ──────────────────────── */}
                      <div className="border-t border-[#EEEBE7] pt-1" />
                      <div className="space-y-1.5">
                        <FieldLabel>Initial Notes</FieldLabel>
                        <Textarea
                          placeholder="Add any context, observations, or first-contact details about this lead…"
                          rows={3}
                          {...register("initial_notes")}
                          className="text-sm bg-white focus:ring-[#7A6652]/20 focus:border-[#7A6652] placeholder:text-[#C8C0B8]"
                        />
                        <p className="text-[11px] text-[#B0ADA8] leading-relaxed">
                          If provided, a follow-up task will be auto-created and
                          assigned to the selected agent.
                        </p>
                        <FieldError message={errors.initial_notes?.message} />
                      </div>

                      {/* Server error */}
                      <AnimatePresence>
                        {serverError && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="flex items-start gap-2.5 text-sm text-danger bg-danger-light border border-danger/18 rounded-xl px-4 py-3"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-danger shrink-0 mt-1.5" />
                            <span>{serverError}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Footer */}
                      <div className="flex items-center justify-end gap-2.5 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleClose}
                          disabled={isSubmitting}
                          className="text-sm text-[#6B6B6B]"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={isSubmitting}
                          className="text-sm min-w-[120px] border border-transparent hover:border-brand-gold/35 hover:shadow-[0_0_16px_-3px_rgb(212_175_55/0.2)] transition-all duration-300"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Saving…
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              Add Lead
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </form>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPortal>
        )}
      </Dialog>
    </>
  );
}
