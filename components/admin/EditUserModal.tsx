"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save,
  Shield,
  User,
  Briefcase,
  Sparkles,
  TrendingUp,
  Code2,
  ShoppingBag,
  Home,
  Award,
  Megaphone,
  UserCheck,
  Lock,
  Crown,
  Check,
  Mail,
  Info,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { updateUserProfile, getProfilesForReportsTo } from "@/lib/actions/admin";
import { updateUserProfileSchema } from "@/lib/validations/user";
import type { EmployeeDepartment, IndulgeDomain, Profile, UserRole } from "@/lib/types/database";
import {
  DEPARTMENT_CONFIG,
  DOMAIN_CONFIG,
  ALL_DEPARTMENTS,
  getDefaultDomainForDepartment,
  coerceIndulgeDomain,
} from "@/lib/constants/departments";
import { cn } from "@/lib/utils";
import { mapAuthError } from "@/lib/utils/auth-errors";

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

const ROLE_CONFIG: {
  value: UserRole;
  label: string;
  description: string;
  color: string;
  bg: string;
  founderLocked?: boolean;
}[] = [
  {
    value: "founder",
    label: "Founder",
    description: "Business owner — not assignable from this screen",
    color: "#A88B25",
    bg: "#FEF3C7",
    founderLocked: true,
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

function domainFromProfile(profile: Profile): IndulgeDomain {
  const raw = profile.domain as string;
  if (raw === "the_indulge_house") return "indulge_house";
  return coerceIndulgeDomain(raw);
}

const ALL_DOMAIN_KEYS = Object.keys(DOMAIN_CONFIG) as IndulgeDomain[];

interface EditUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  profile: Profile;
}

export function EditUserModal({ open, onClose, onSuccess, profile }: EditUserModalProps) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [jobTitle, setJobTitle] = useState(profile.job_title ?? "");
  const [employeeDepartment, setEmployeeDepartment] = useState<EmployeeDepartment | null>(
    profile.department ?? null
  );
  const [domain, setDomain] = useState<IndulgeDomain>(() => domainFromProfile(profile));
  const [role, setRole] = useState<UserRole>(profile.role);
  const [reportsTo, setReportsTo] = useState<string | null>(profile.reports_to ?? null);
  const [reportsToOptions, setReportsToOptions] = useState<
    Pick<Profile, "id" | "full_name" | "job_title" | "role" | "department">[]
  >([]);
  const [reportsToSearch, setReportsToSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipNextDomainAutosync = useRef(false);

  useEffect(() => {
    if (!open) return;
    skipNextDomainAutosync.current = true;
    setFullName(profile.full_name);
    setJobTitle(profile.job_title ?? "");
    setEmployeeDepartment(profile.department ?? null);
    setDomain(domainFromProfile(profile));
    setRole(profile.role);
    setReportsTo(profile.reports_to ?? null);
    setReportsToSearch("");
    setError(null);
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    if (skipNextDomainAutosync.current) {
      skipNextDomainAutosync.current = false;
      return;
    }
    if (employeeDepartment) {
      setDomain(getDefaultDomainForDepartment(employeeDepartment));
    }
  }, [employeeDepartment, open]);

  useEffect(() => {
    if (!open) return;
    getProfilesForReportsTo(profile.id).then((res) => {
      if (res.success && res.data) setReportsToOptions(res.data);
    });
  }, [open, profile.id]);

  const filteredReportsToCandidates = useMemo(
    () =>
      reportsToOptions.filter(
        (p) =>
          p.full_name.toLowerCase().includes(reportsToSearch.toLowerCase()) ||
          (p.job_title ?? "").toLowerCase().includes(reportsToSearch.toLowerCase())
      ),
    [reportsToOptions, reportsToSearch]
  );

  const domainChoices: IndulgeDomain[] = useMemo(() => {
    if (!employeeDepartment) {
      return ALL_DOMAIN_KEYS;
    }
    const deptDomains = [
      ...(DEPARTMENT_CONFIG[employeeDepartment]?.allowedDomains ?? []),
      "indulge_global",
    ].filter((d, i, arr) => arr.indexOf(d) === i) as IndulgeDomain[];
    return deptDomains;
  }, [employeeDepartment]);

  useEffect(() => {
    if (!open) return;
    if (!domainChoices.includes(domain)) {
      setDomain(domainChoices[0] ?? "indulge_concierge");
    }
  }, [open, domainChoices, domain]);

  const deptCfg = employeeDepartment ? DEPARTMENT_CONFIG[employeeDepartment] : null;
  const domainCfg = DOMAIN_CONFIG[domain];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!jobTitle.trim()) {
      setError("Job title is required.");
      return;
    }

    const parsed = updateUserProfileSchema.safeParse({
      full_name: fullName.trim(),
      job_title: jobTitle.trim() === "" ? null : jobTitle.trim(),
      role,
      domain,
      department: employeeDepartment,
      reports_to: reportsTo,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your input.");
      return;
    }

    setLoading(true);
    const result = await updateUserProfile(profile.id, parsed.data);
    setLoading(false);

    if (!result.success) {
      setError(mapAuthError(result.error ?? null));
      return;
    }

    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Same axes as <span className="font-medium text-[#1A1A1A]">New User</span>: department
            (workspace), data domain, role, and reporting line. Changes sync to Auth metadata for
            access control.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-1">
          <div className="rounded-lg border border-[#E5E4DF] bg-[#FAFAF8] px-3 py-2 flex items-center gap-2 text-xs text-[#6B6B6B]">
            <Mail className="w-3.5 h-3.5 shrink-0 text-[#B5A99A]" aria-hidden />
            <span className="font-medium text-[#1A1A1A]">{profile.email}</span>
            <span className="text-[#B5A99A]">— email cannot be changed here</span>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-[#8A8A6E] uppercase tracking-wider mb-3">
              Identity
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <IndulgeField label="Full name" required>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </IndulgeField>
              <IndulgeField label="Job title" required hint="Shown on roster and directory">
                <Input
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  required
                  placeholder="e.g. Senior Concierge"
                />
              </IndulgeField>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-[#8A8A6E] uppercase tracking-wider mb-2">
              Department & data domain
            </p>
            <p className="text-xs text-[#8A8A6E] mb-3">
              Department controls sidebar routes; domain controls which business data they see
              (RLS).
            </p>

            <div className="mb-3">
              <p className="text-xs font-semibold text-[#1A1A1A] mb-2">Department</p>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setEmployeeDepartment(null)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all text-center",
                    employeeDepartment === null
                      ? "border-[#D4AF37] bg-[#D4AF37]/6"
                      : "border-[#E5E4DF] hover:border-[#D0C8BE] bg-white"
                  )}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#F4F3F0]">
                    <Shield className="w-4 h-4 text-[#8A8A6E]" />
                  </div>
                  <p className="text-[10px] font-semibold leading-tight text-[#1A1A1A]">None</p>
                  <p className="text-[9px] text-[#9E9E9E] leading-tight">Cross-functional</p>
                </button>
                {ALL_DEPARTMENTS.map((dept) => {
                  const cfg = DEPARTMENT_CONFIG[dept];
                  const DeptIcon = DEPT_ICON_MAP[cfg.icon] ?? Sparkles;
                  const isSelected = employeeDepartment === dept;
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => setEmployeeDepartment(dept)}
                      className={cn(
                        "flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all text-center",
                        isSelected
                          ? "border-[#D4AF37] bg-[#D4AF37]/6"
                          : "border-[#E5E4DF] hover:border-[#D0C8BE] bg-white"
                      )}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{
                          backgroundColor: isSelected ? `${cfg.accentColor}18` : "#F4F3F0",
                        }}
                      >
                        <DeptIcon
                          className="w-4 h-4"
                          color={isSelected ? cfg.accentColor : "#8A8A6E"}
                        />
                      </div>
                      <p
                        className={cn(
                          "text-[10px] font-semibold leading-tight",
                          isSelected ? "text-[#1A1A1A]" : "text-[#4A4A4A]"
                        )}
                      >
                        {cfg.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-[#1A1A1A] mb-2">Data access domain</p>
              <div className="space-y-2">
                {domainChoices.map((d) => {
                  const cfg = DOMAIN_CONFIG[d];
                  const isSelected = domain === d;
                  const isPrimary =
                    !!employeeDepartment &&
                    d === DEPARTMENT_CONFIG[employeeDepartment]?.primaryDomain;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDomain(d)}
                      className={cn(
                        "w-full flex items-start gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all",
                        isSelected
                          ? "border-[#D4AF37] bg-[#D4AF37]/5"
                          : "border-[#E5E4DF] hover:border-[#D0C8BE] bg-white"
                      )}
                    >
                      <div
                        className="w-3 h-3 rounded-full mt-0.5 shrink-0"
                        style={{ backgroundColor: cfg.pillColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13px] font-semibold text-[#1A1A1A]">{cfg.label}</p>
                          {isPrimary && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#A88B25] uppercase tracking-wide">
                              Recommended
                            </span>
                          )}
                          {d === "indulge_global" && (
                            <span className="text-[9px] font-medium text-[#8A8A6E]">
                              Finance, Tech, Marketing
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#8A8A6E] mt-0.5">{cfg.description}</p>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <AnimatePresence>
              {(employeeDepartment ?? domain) && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex gap-3 p-3.5 rounded-xl bg-[#F9F7F0] border border-[#E5E0D0] mt-3"
                >
                  <Info className="w-4 h-4 text-[#A88B25] shrink-0 mt-0.5" />
                  <p className="text-[12px] text-[#6B5E3A] leading-relaxed">
                    {employeeDepartment ? (
                      <>
                        <strong>{deptCfg?.label}</strong> uses the{" "}
                        <strong>{deptCfg?.workspaceRoute}</strong> workspace; data scope:{" "}
                        <strong>{domainCfg?.label}</strong>.
                      </>
                    ) : (
                      <>
                        No department: cross-functional navigation (typical for admin/founder).
                        Data scope: <strong>{domainCfg?.label}</strong>.
                      </>
                    )}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-[#8A8A6E] uppercase tracking-wider mb-2">
              Permission role
            </p>
            <div className="space-y-2">
              {ROLE_CONFIG.map((opt) => {
                const isSelected = role === opt.value;
                const locked = !!opt.founderLocked && profile.role !== "founder";
                const roleDescription =
                  opt.founderLocked && profile.role === "founder"
                    ? "Keeps elevated access; new founders are not assigned from this screen."
                    : opt.description;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={locked}
                    onClick={() => !locked && setRole(opt.value)}
                    title={
                      locked
                        ? "Founder role cannot be assigned from user management."
                        : undefined
                    }
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all",
                      locked
                        ? "border-[#EAEAEA] bg-[#F9F9F9] opacity-60 cursor-not-allowed"
                        : isSelected
                          ? "border-[#D4AF37] bg-[#D4AF37]/5"
                          : "border-[#E5E4DF] hover:border-[#D0C8BE] bg-white"
                    )}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: opt.bg }}
                    >
                      {locked ? (
                        <Lock className="w-4 h-4" style={{ color: opt.color }} />
                      ) : opt.value === "admin" || opt.value === "founder" ? (
                        <Crown className="w-4 h-4" style={{ color: opt.color }} />
                      ) : opt.value === "manager" ? (
                        <Briefcase className="w-4 h-4" style={{ color: opt.color }} />
                      ) : (
                        <User className="w-4 h-4" style={{ color: opt.color }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">
                        {opt.label}
                        {locked && (
                          <span className="ml-2 text-[10px] text-[#B5A99A] font-normal">
                            Reserved
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-[#8A8A6E] mt-0.5 leading-snug">
                        {roleDescription}
                      </p>
                    </div>
                    {isSelected && !locked && (
                      <Check className="w-4 h-4 text-[#D4AF37] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-[#1A1A1A] mb-1.5">
              Reports to{" "}
              <span className="text-[#B5A99A] font-normal normal-case text-[11px]">— optional</span>
            </p>
            <Input
              placeholder="Search managers & admins…"
              value={reportsToSearch}
              onChange={(e) => setReportsToSearch(e.target.value)}
              className="mb-2"
            />
            <div className="space-y-1 max-h-40 overflow-y-auto">
              <button
                type="button"
                onClick={() => setReportsTo(null)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all text-sm",
                  reportsTo === null
                    ? "border-[#D4AF37]/40 bg-[#D4AF37]/6 text-[#A88B25]"
                    : "border-[#E5E4DF] hover:border-[#D0C8BE] bg-white text-[#8A8A6E]"
                )}
              >
                <div className="w-7 h-7 rounded-full bg-[#F2F2EE] flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5 text-[#B5A99A]" />
                </div>
                <span className="text-[12px]">No direct manager</span>
                {reportsTo === null && (
                  <Check className="w-3.5 h-3.5 ml-auto text-[#D4AF37]" />
                )}
              </button>

              {filteredReportsToCandidates.map((candidate) => {
                const isSelected = reportsTo === candidate.id;
                const dept = candidate.department
                  ? DEPARTMENT_CONFIG[candidate.department]?.label
                  : null;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setReportsTo(candidate.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all",
                      isSelected
                        ? "border-[#D4AF37]/40 bg-[#D4AF37]/6"
                        : "border-[#E5E4DF] hover:border-[#D0C8BE] bg-white"
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
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />}
                  </button>
                );
              })}

              {filteredReportsToCandidates.length === 0 && reportsToSearch && (
                <p className="text-[11px] text-[#B5A99A] text-center py-3">
                  No managers matching &quot;{reportsToSearch}&quot;
                </p>
              )}
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm text-[#C0392B] bg-[#FAEAE8] border border-[#C0392B]/20 rounded-lg px-3 py-2"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <IndulgeButton
              type="submit"
              variant="gold"
              loading={loading}
              leftIcon={loading ? undefined : <Save className="w-4 h-4" />}
            >
              Save changes
            </IndulgeButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
