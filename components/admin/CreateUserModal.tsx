"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, Controller, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  TrendingUp,
  Code2,
  ShoppingBag,
  Home,
  Award,
  Megaphone,
  UserCheck,
  Shield,
  User,
  Briefcase,
  Lock,
  ChevronRight,
  ChevronLeft,
  UserPlus,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Info,
  Crown,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { IndulgeField } from "@/components/ui/indulge-field";
import { cn } from "@/lib/utils";
import {
  createUser,
  checkEmailExists,
  getProfilesForReportsTo,
} from "@/lib/actions/admin";
import { mapAuthError } from "@/lib/utils/auth-errors";
import {
  createUserSchema,
  type CreateUserFormInput,
  type CreateUserInput,
} from "@/lib/validations/user";
import type {
  EmployeeDepartment,
  IndulgeDomain,
  UserRole,
  Profile,
} from "@/lib/types/database";
import {
  DEPARTMENT_CONFIG,
  DOMAIN_CONFIG,
  ALL_DEPARTMENTS,
  getDefaultDomainForDepartment,
} from "@/lib/constants/departments";
import { DOMAIN_DISPLAY_CONFIG } from "@/lib/types/database";

// ── Types ────────────────────────────────────────────────────

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type WizardStep = 1 | 2 | 3 | 4;

// ── Department icon map (Lucide components keyed by string name) ─────────

const DEPT_ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  TrendingUp,
  Code2,
  ShoppingBag,
  Home,
  Award,
  Megaphone,
  UserCheck,
};

// ── Role display config ──────────────────────────────────────

const ROLE_CONFIG: {
  value: UserRole;
  label: string;
  description: string;
  color: string;
  bg: string;
  locked?: boolean;
  lockedReason?: string;
}[] = [
  {
    value: "founder",
    label: "Founder",
    description:
      "Business owner — assigned directly by the platform administrator",
    color: "#A88B25",
    bg: "#FEF3C7",
    locked: true,
    lockedReason:
      "Founders are assigned directly by the platform administrator",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Full access to all Atlas modules and settings",
    color: "#C5830A",
    bg: "#FEF9EE",
  },
  {
    value: "manager",
    label: "Manager",
    description: "Manages team, approves leave & expenses, views reports",
    color: "#6B4FBB",
    bg: "#F0EBFF",
  },
  {
    value: "agent",
    label: "Agent",
    description: "Standard department workspace access",
    color: "#2C6FAC",
    bg: "#E8F0FA",
  },
  {
    value: "guest",
    label: "Viewer",
    description: "Read-only access to their department workspace",
    color: "#6B7280",
    bg: "#F4F4F5",
  },
];

// ── Step indicator ───────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { n: 1, label: "Identity" },
    { n: 2, label: "Dept & Domain" },
    { n: 3, label: "Role" },
    { n: 4, label: "Review" },
  ];

  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((step, idx) => {
        const done = currentStep > step.n;
        const active = currentStep === step.n;
        return (
          <div key={step.n} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all",
                  done
                    ? "bg-[#D4AF37] border-[#D4AF37] text-white"
                    : active
                      ? "bg-white border-[#D4AF37] text-[#D4AF37]"
                      : "bg-white border-[#E5E4DF] text-[#B5A99A]",
                )}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : step.n}
              </div>
              <span
                className={cn(
                  "text-[9px] font-medium uppercase tracking-wider whitespace-nowrap",
                  active
                    ? "text-[#D4AF37]"
                    : done
                      ? "text-[#8A8A6E]"
                      : "text-[#C0B8B0]",
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1 mx-1 mb-5 transition-colors",
                  done ? "bg-[#D4AF37]/40" : "bg-[#E5E4DF]",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

export function CreateUserModal({
  open,
  onClose,
  onSuccess,
}: CreateUserModalProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailCheckState, setEmailCheckState] = useState<
    "idle" | "checking" | "taken" | "ok"
  >("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [reportsToOptions, setReportsToOptions] = useState<
    Pick<Profile, "id" | "full_name" | "job_title" | "role" | "department">[]
  >([]);
  const [reportsToSearch, setReportsToSearch] = useState("");

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    trigger,
    reset,
    clearErrors,
    formState: { errors },
  } = useForm<CreateUserFormInput, unknown, CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      role: "agent",
      domain: "indulge_concierge",
      department: null,
      reports_to: null,
      send_invite: true,
    },
  });

  const watchedDepartment = watch("department");
  const watchedDomain = watch("domain");
  const watchedRole = watch("role");
  const watchedSendInvite = watch("send_invite");
  const watchedEmail = watch("email");

  // Load "reports to" options once when step 3 is reached.
  useEffect(() => {
    if (step === 3 && reportsToOptions.length === 0) {
      getProfilesForReportsTo().then((res) => {
        if (res.success && res.data) setReportsToOptions(res.data);
      });
    }
  }, [step, reportsToOptions.length]);

  // Real-time email duplicate check (debounced).
  useEffect(() => {
    if (
      !watchedEmail ||
      watchedEmail.length < 5 ||
      !watchedEmail.includes("@")
    ) {
      setEmailCheckState("idle");
      return;
    }
    setEmailCheckState("checking");
    const timer = setTimeout(async () => {
      const res = await checkEmailExists(watchedEmail);
      if (res.success) {
        setEmailCheckState(res.data?.exists ? "taken" : "ok");
      } else {
        setEmailCheckState("idle");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [watchedEmail]);

  // When department changes, auto-suggest the primary domain.
  useEffect(() => {
    if (watchedDepartment) {
      const suggested = getDefaultDomainForDepartment(watchedDepartment);
      setValue("domain", suggested, { shouldDirty: true });
    }
  }, [watchedDepartment, setValue]);

  function handleClose() {
    if (isSubmitting) return;
    reset();
    setStep(1);
    setSubmitError(null);
    setEmailCheckState("idle");
    setReportsToSearch("");
    onClose();
  }

  async function goNext() {
    const stepFields: Record<WizardStep, (keyof CreateUserFormInput)[]> = {
      1: ["full_name", "email", "job_title"],
      2: ["domain", "department"],
      3: ["role"],
      4: [],
    };

    const valid = await trigger(
      stepFields[step] as (keyof CreateUserFormInput)[],
    );
    if (!valid) return;

    if (step === 1 && emailCheckState === "taken") return;

    setStep((s) => Math.min(s + 1, 4) as WizardStep);
  }

  function goPrev() {
    setStep((s) => Math.max(s - 1, 1) as WizardStep);
  }

  const onSubmit = useCallback(
    async (data: CreateUserInput) => {
      setSubmitError(null);
      setIsSubmitting(true);
      const result = await createUser(data);
      setIsSubmitting(false);

      if (!result.success) {
        setSubmitError(mapAuthError(result.error ?? null));
        return;
      }

      reset();
      setStep(1);
      onSuccess();
    },
    [reset, onSuccess],
  );

  function firstValidationMessage(
    errors: FieldErrors<CreateUserFormInput>,
  ): string {
    const walk = (e: object | undefined): string | undefined => {
      if (!e || typeof e !== "object") return undefined;
      for (const v of Object.values(e)) {
        if (v && typeof v === "object" && "message" in v && v.message) {
          return String(v.message);
        }
        const nested = walk(v as object);
        if (nested) return nested;
      }
      return undefined;
    };
    return (
      walk(errors as object) ??
      "Some fields are invalid. Use Back to review earlier steps."
    );
  }

  const onInvalid = useCallback((errors: FieldErrors<CreateUserFormInput>) => {
    setSubmitError(firstValidationMessage(errors));
  }, []);

  // ── Access summary (computed for Step 4 review) ────────────────────────
  const deptCfg = watchedDepartment
    ? DEPARTMENT_CONFIG[watchedDepartment]
    : null;
  const domainCfg = DOMAIN_CONFIG[watchedDomain];
  const roleCfg = ROLE_CONFIG.find((r) => r.value === watchedRole);

  // ── Filtered "Reports To" options ──────────────────────────────────────
  const filteredReportsToCandidates = reportsToOptions.filter(
    (p) =>
      p.full_name.toLowerCase().includes(reportsToSearch.toLowerCase()) ||
      (p.job_title ?? "").toLowerCase().includes(reportsToSearch.toLowerCase()),
  );

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/25 flex items-center justify-center shrink-0">
              <UserPlus className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div>
              <DialogTitle className="text-[15px] font-semibold text-[#1A1A1A]">
                Create New User
              </DialogTitle>
              <p className="text-[11px] text-[#8A8A6E] mt-0.5">
                Configure identity, workspace access, and role
              </p>
            </div>
          </div>
          <StepIndicator currentStep={step} />
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit, onInvalid)}
          className="space-y-5"
        >
          <AnimatePresence mode="wait">
            {/* ── STEP 1: Identity ─────────────────────────────── */}
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <p className="text-[11px] font-semibold text-[#8A8A6E] uppercase tracking-wider mb-3">
                  Step 1 — Identity
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <IndulgeField
                    label="Full Name"
                    error={errors.full_name?.message}
                    required
                    className="col-span-2 sm:col-span-1"
                  >
                    <Input
                      {...register("full_name")}
                      placeholder="e.g. Sarah Al-Mansoori"
                      error={!!errors.full_name}
                      autoComplete="name"
                      autoFocus
                    />
                  </IndulgeField>

                  <IndulgeField
                    label="Job Title"
                    error={errors.job_title?.message}
                    required
                    hint={
                      watchedDepartment
                        ? `e.g. Senior ${deptCfg?.label} Manager`
                        : "e.g. Senior Concierge Manager"
                    }
                    className="col-span-2 sm:col-span-1"
                  >
                    <Input
                      {...register("job_title")}
                      placeholder={
                        watchedDepartment
                          ? `e.g. ${deptCfg?.label} Lead`
                          : "Job title"
                      }
                      error={!!errors.job_title}
                    />
                  </IndulgeField>
                </div>

                <IndulgeField
                  label="Work Email"
                  error={
                    errors.email?.message ??
                    (emailCheckState === "taken"
                      ? "This email is already registered."
                      : undefined)
                  }
                  required
                >
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B5A99A] pointer-events-none" />
                    <Input
                      {...register("email")}
                      type="email"
                      placeholder="agent@indulgeglobal.com"
                      error={!!errors.email || emailCheckState === "taken"}
                      autoComplete="email"
                      className="pl-9 pr-9"
                    />
                    {/* Email check indicator */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {emailCheckState === "checking" && (
                        <Loader2 className="w-4 h-4 text-[#B5A99A] animate-spin" />
                      )}
                      {emailCheckState === "ok" && (
                        <Check className="w-4 h-4 text-emerald-500" />
                      )}
                      {emailCheckState === "taken" && (
                        <AlertCircle className="w-4 h-4 text-[#C0392B]" />
                      )}
                    </div>
                  </div>
                </IndulgeField>
              </motion.div>
            )}

            {/* ── STEP 2: Department & Domain ──────────────────── */}
            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <p className="text-[11px] font-semibold text-[#8A8A6E] uppercase tracking-wider">
                  Step 2 — Department & Domain
                </p>

                {/* Department card grid */}
                <div>
                  <p className="text-xs font-semibold text-[#1A1A1A] mb-2">
                    Department
                  </p>
                  <Controller
                    name="department"
                    control={control}
                    render={({ field }) => (
                      <div className="grid grid-cols-4 gap-2">
                        {ALL_DEPARTMENTS.map((dept) => {
                          const cfg = DEPARTMENT_CONFIG[dept];
                          const DeptIcon = DEPT_ICON_MAP[cfg.icon] ?? Sparkles;
                          const isSelected = field.value === dept;
                          return (
                            <button
                              key={dept}
                              type="button"
                              onClick={() => field.onChange(dept)}
                              className={cn(
                                "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center",
                                isSelected
                                  ? "border-[#D4AF37] bg-[#D4AF37]/6"
                                  : "border-[#E5E4DF] hover:border-[#D0C8BE] bg-white",
                              )}
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center"
                                style={{
                                  backgroundColor: isSelected
                                    ? `${cfg.accentColor}18`
                                    : "#F4F3F0",
                                }}
                              >
                                <DeptIcon
                                  className="w-4 h-4"
                                  color={
                                    isSelected ? cfg.accentColor : "#8A8A6E"
                                  }
                                />
                              </div>
                              <p
                                className={cn(
                                  "text-[11px] font-semibold leading-tight",
                                  isSelected
                                    ? "text-[#1A1A1A]"
                                    : "text-[#4A4A4A]",
                                )}
                              >
                                {cfg.label}
                              </p>
                              <p className="text-[9px] text-[#9E9E9E] leading-tight line-clamp-2">
                                {cfg.description}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  />
                </div>

                {/* Domain selector — shown after department is selected */}
                <AnimatePresence>
                  {watchedDepartment && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                    >
                      <p className="text-xs font-semibold text-[#1A1A1A] mb-2">
                        Data Access Domain
                      </p>
                      <Controller
                        name="domain"
                        control={control}
                        render={({ field }) => {
                          const deptDomains: IndulgeDomain[] = [
                            ...(DEPARTMENT_CONFIG[watchedDepartment]
                              ?.allowedDomains ?? []),
                            "indulge_global",
                          ].filter(
                            (d, i, arr) => arr.indexOf(d) === i,
                          ) as IndulgeDomain[];

                          return (
                            <div className="space-y-2">
                              {deptDomains.map((domain) => {
                                const cfg = DOMAIN_CONFIG[domain];
                                const isSelected = field.value === domain;
                                const isPrimary =
                                  domain ===
                                  DEPARTMENT_CONFIG[watchedDepartment]
                                    ?.primaryDomain;
                                return (
                                  <button
                                    key={domain}
                                    type="button"
                                    onClick={() => field.onChange(domain)}
                                    className={cn(
                                      "w-full flex items-start gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all",
                                      isSelected
                                        ? "border-[#D4AF37] bg-[#D4AF37]/5"
                                        : "border-[#E5E4DF] hover:border-[#D0C8BE] bg-white",
                                    )}
                                  >
                                    <div
                                      className="w-3 h-3 rounded-full mt-0.5 shrink-0"
                                      style={{ backgroundColor: cfg.pillColor }}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="text-[13px] font-semibold text-[#1A1A1A]">
                                          {cfg.label}
                                        </p>
                                        {isPrimary && (
                                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#A88B25] uppercase tracking-wide">
                                            Recommended
                                          </span>
                                        )}
                                        {domain === "indulge_global" && (
                                          <span className="text-[9px] font-medium text-[#8A8A6E]">
                                            Finance, Tech, Marketing, Management
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-[#8A8A6E] mt-0.5">
                                        {cfg.description}
                                      </p>
                                    </div>
                                    {isSelected && (
                                      <Check className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Contextual explanation panel */}
                <AnimatePresence>
                  {watchedDepartment && watchedDomain && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex gap-3 p-3.5 rounded-xl bg-[#F9F7F0] border border-[#E5E0D0]"
                    >
                      <Info className="w-4 h-4 text-[#A88B25] shrink-0 mt-0.5" />
                      <p className="text-[12px] text-[#6B5E3A] leading-relaxed">
                        <strong>{deptCfg?.label}</strong> team members access
                        the <strong>{deptCfg?.workspaceRoute}</strong> workspace
                        and see <strong>{domainCfg?.label}</strong> data.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* ── STEP 3: Role & Reporting ──────────────────────── */}
            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <p className="text-[11px] font-semibold text-[#8A8A6E] uppercase tracking-wider">
                  Step 3 — Role & Reporting Line
                </p>

                {/* Role selector — vertical stack */}
                <div>
                  <p className="text-xs font-semibold text-[#1A1A1A] mb-2">
                    Permission Role
                  </p>
                  <Controller
                    name="role"
                    control={control}
                    render={({ field }) => (
                      <div className="space-y-2">
                        {ROLE_CONFIG.map((opt) => {
                          const isSelected = field.value === opt.value;
                          const isLocked = !!opt.locked;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={isLocked}
                              onClick={() =>
                                !isLocked && field.onChange(opt.value)
                              }
                              title={isLocked ? opt.lockedReason : undefined}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all",
                                isLocked
                                  ? "border-[#EAEAEA] bg-[#F9F9F9] opacity-60 cursor-not-allowed"
                                  : isSelected
                                    ? "border-[#D4AF37] bg-[#D4AF37]/5"
                                    : "border-[#E5E4DF] hover:border-[#D0C8BE] bg-white cursor-pointer",
                              )}
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                style={{ backgroundColor: opt.bg }}
                              >
                                {isLocked ? (
                                  <Lock
                                    className="w-4 h-4"
                                    style={{ color: opt.color }}
                                  />
                                ) : opt.value === "admin" ||
                                  opt.value === "founder" ? (
                                  <Crown
                                    className="w-4 h-4"
                                    style={{ color: opt.color }}
                                  />
                                ) : opt.value === "manager" ? (
                                  <Briefcase
                                    className="w-4 h-4"
                                    style={{ color: opt.color }}
                                  />
                                ) : (
                                  <User
                                    className="w-4 h-4"
                                    style={{ color: opt.color }}
                                  />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-[#1A1A1A]">
                                  {opt.label}
                                  {isLocked && (
                                    <span className="ml-2 text-[10px] text-[#B5A99A]">
                                      Reserved
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-[#8A8A6E] mt-0.5 leading-snug">
                                  {opt.description}
                                </p>
                              </div>
                              {isSelected && !isLocked && (
                                <Check className="w-4 h-4 text-[#D4AF37] shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  />
                </div>

                {/* Reports To search */}
                <div>
                  <p className="text-xs font-semibold text-[#1A1A1A] mb-1.5">
                    Reports To{" "}
                    <span className="text-[#B5A99A] font-normal normal-case text-[11px]">
                      — optional
                    </span>
                  </p>
                  <Input
                    placeholder="Search managers & admins…"
                    value={reportsToSearch}
                    onChange={(e) => setReportsToSearch(e.target.value)}
                    className="mb-2"
                  />
                  <Controller
                    name="reports_to"
                    control={control}
                    render={({ field }) => (
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {/* None option */}
                        <button
                          type="button"
                          onClick={() => field.onChange(null)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all text-sm",
                            field.value === null
                              ? "border-[#D4AF37]/40 bg-[#D4AF37]/6 text-[#A88B25]"
                              : "border-[#E5E4DF] hover:border-[#D0C8BE] bg-white text-[#8A8A6E]",
                          )}
                        >
                          <div className="w-7 h-7 rounded-full bg-[#F2F2EE] flex items-center justify-center shrink-0">
                            <User className="w-3.5 h-3.5 text-[#B5A99A]" />
                          </div>
                          <span className="text-[12px]">No direct manager</span>
                          {field.value === null && (
                            <Check className="w-3.5 h-3.5 ml-auto text-[#D4AF37]" />
                          )}
                        </button>

                        {filteredReportsToCandidates.map((candidate) => {
                          const isSelected = field.value === candidate.id;
                          const dept = candidate.department
                            ? DEPARTMENT_CONFIG[candidate.department]?.label
                            : null;
                          return (
                            <button
                              key={candidate.id}
                              type="button"
                              onClick={() => field.onChange(candidate.id)}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all",
                                isSelected
                                  ? "border-[#D4AF37]/40 bg-[#D4AF37]/6"
                                  : "border-[#E5E4DF] hover:border-[#D0C8BE] bg-white",
                              )}
                            >
                              <div className="w-7 h-7 rounded-full bg-[#D4AF37]/15 flex items-center justify-center shrink-0 text-[10px] font-bold text-[#A88B25]">
                                {candidate.full_name.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-semibold text-[#1A1A1A] truncate">
                                  {candidate.full_name}
                                </p>
                                <p className="text-[10px] text-[#8A8A6E] truncate">
                                  {candidate.job_title ?? candidate.role}
                                  {dept ? ` · ${dept}` : ""}
                                </p>
                              </div>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                              )}
                            </button>
                          );
                        })}

                        {filteredReportsToCandidates.length === 0 &&
                          reportsToSearch && (
                            <p className="text-[11px] text-[#B5A99A] text-center py-3">
                              No managers matching "{reportsToSearch}"
                            </p>
                          )}
                      </div>
                    )}
                  />
                </div>
              </motion.div>
            )}

            {/* ── STEP 4: Review ────────────────────────────────── */}
            {step === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <p className="text-[11px] font-semibold text-[#8A8A6E] uppercase tracking-wider">
                  Step 4 — Review & Create
                </p>

                {/* Sign-in method — last decision before summary */}
                <div className="rounded-xl border border-[#E5E4DF] bg-white overflow-hidden shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
                  <div className="px-4 py-2.5 border-b border-[#E5E4DF] bg-[#FAFAF8]">
                    <p className="text-[10px] font-semibold text-[#8A8A6E] uppercase tracking-wider">
                      Sign-in method
                    </p>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="flex gap-4 items-start sm:items-center">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20">
                        <Mail className="h-5 w-5 text-[#A88B25]" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <label
                          htmlFor="create-user-send-invite"
                          className="text-[13px] font-semibold text-[#1A1A1A] leading-snug block"
                        >
                          Send invite email
                        </label>
                        <p className="text-[11px] text-[#8A8A6E] leading-relaxed">
                          {watchedSendInvite !== false
                            ? "They'll get a secure link to choose their own password."
                            : "You'll set a temporary password now and can share it out of band."}
                        </p>
                      </div>
                      <Controller
                        name="send_invite"
                        control={control}
                        render={({ field }) => (
                          <Switch
                            id="create-user-send-invite"
                            checked={field.value !== false}
                            onCheckedChange={(on) => {
                              field.onChange(on);
                              if (on) {
                                setValue("password", "", {
                                  shouldDirty: false,
                                  shouldValidate: true,
                                });
                                clearErrors("password");
                              }
                            }}
                            className="shrink-0 self-start sm:self-center sm:mt-0 mt-1"
                            aria-label="Send invite email instead of setting password"
                          />
                        )}
                      />
                    </div>

                    <AnimatePresence>
                      {watchedSendInvite === false && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.15 }}
                          className="pt-1 border-t border-[#F0EFE9]"
                        >
                          <IndulgeField
                            label="Temporary password"
                            error={errors.password?.message}
                            hint="Minimum 12 characters. Share securely; they should change it after first login."
                            required
                          >
                            <div className="relative">
                              <Input
                                {...register("password")}
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter temporary password"
                                error={!!errors.password}
                                className="pr-10"
                                autoComplete="new-password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B5A99A] hover:text-[#6B6B6B] transition-colors"
                              >
                                {showPassword ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </IndulgeField>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Summary card */}
                <div className="border border-[#E5E4DF] rounded-xl overflow-hidden">
                  {/* Identity */}
                  <div className="px-4 py-3 bg-[#F9F9F6] border-b border-[#E5E4DF]">
                    <p className="text-[10px] font-semibold text-[#8A8A6E] uppercase tracking-wider mb-2">
                      Identity
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/15 flex items-center justify-center text-[13px] font-bold text-[#A88B25] shrink-0">
                        {watch("full_name")?.slice(0, 2).toUpperCase() || "??"}
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-[#1A1A1A]">
                          {watch("full_name") || "—"}
                        </p>
                        <p className="text-[11px] text-[#6B6B6B]">
                          {watch("job_title") || "—"}
                        </p>
                        <p className="text-[11px] text-[#8A8A6E]">
                          {watch("email") || "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Department & Domain */}
                  <div className="px-4 py-3 border-b border-[#E5E4DF]">
                    <p className="text-[10px] font-semibold text-[#8A8A6E] uppercase tracking-wider mb-2">
                      Access Configuration
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-[#B5A99A] uppercase tracking-wide mb-1">
                          Department
                        </p>
                        <p className="text-[13px] font-medium text-[#1A1A1A]">
                          {deptCfg?.label ?? "None selected"}
                        </p>
                        {deptCfg && (
                          <p className="text-[10px] text-[#8A8A6E]">
                            Workspace: {deptCfg.workspaceRoute}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-[#B5A99A] uppercase tracking-wide mb-1">
                          Data Domain
                        </p>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                          style={{
                            backgroundColor:
                              DOMAIN_DISPLAY_CONFIG[watchedDomain]?.pillBg ??
                              "#F4F4F5",
                            color:
                              DOMAIN_DISPLAY_CONFIG[watchedDomain]?.pillColor ??
                              "#6B7280",
                          }}
                        >
                          {DOMAIN_DISPLAY_CONFIG[watchedDomain]?.shortLabel ??
                            watchedDomain}
                        </span>
                        {domainCfg && (
                          <p className="text-[10px] text-[#8A8A6E] mt-1 leading-tight">
                            {domainCfg.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Role */}
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-semibold text-[#8A8A6E] uppercase tracking-wider mb-2">
                      Role & Auth
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2.5 py-1 rounded-lg text-[12px] font-semibold capitalize"
                          style={{
                            backgroundColor: roleCfg?.bg ?? "#F4F4F5",
                            color: roleCfg?.color ?? "#6B7280",
                          }}
                        >
                          {watchedRole}
                        </span>
                        <span className="text-[11px] text-[#8A8A6E]">
                          {roleCfg?.description}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                          watchedSendInvite !== false
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700",
                        )}
                      >
                        {watchedSendInvite !== false
                          ? "Invite email"
                          : "Password set"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Access summary */}
                {deptCfg && (
                  <div className="flex gap-3 p-3.5 rounded-xl bg-[#F9F7F0] border border-[#E5E0D0]">
                    <Shield className="w-4 h-4 text-[#A88B25] shrink-0 mt-0.5" />
                    <div className="text-[11px] text-[#6B5E3A] leading-relaxed">
                      <strong>{watch("full_name") || "This user"}</strong> will
                      access the <strong>{deptCfg.workspaceRoute}</strong>{" "}
                      workspace, see <strong>{domainCfg?.label}</strong> data,
                      and have <strong>{watchedRole}</strong> permissions.
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Validation / server errors — pinned above footer so submit feedback is always visible */}
          <AnimatePresence>
            {submitError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 text-sm text-[#C0392B] bg-[#FAEAE8] border border-[#C0392B]/20 rounded-lg px-3 py-2.5 mb-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {submitError}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Navigation buttons ────────────────────────────── */}
          <div className="flex items-center justify-between pt-2 border-t border-[#F0EFE9]">
            <Button
              type="button"
              variant="ghost"
              onClick={step === 1 ? handleClose : goPrev}
              disabled={isSubmitting}
              className="gap-1.5"
            >
              {step === 1 ? (
                "Cancel"
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </>
              )}
            </Button>

            {step < 4 ? (
              <Button
                type="button"
                variant="gold"
                onClick={goNext}
                disabled={
                  emailCheckState === "taken" || emailCheckState === "checking"
                }
                className="gap-1.5"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <IndulgeButton
                type="submit"
                variant="gold"
                loading={isSubmitting}
                leftIcon={<UserPlus className="w-4 h-4" />}
              >
                {watchedSendInvite !== false
                  ? "Create & Send Invite"
                  : "Create User"}
              </IndulgeButton>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
