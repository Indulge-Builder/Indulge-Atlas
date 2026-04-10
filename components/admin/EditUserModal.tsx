"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Save, Shield, User, Briefcase } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateUserProfile } from "@/lib/actions/admin";
import { updateUserProfileSchema } from "@/lib/validations/user";
import type { IndulgeDomain, Profile, UserRole } from "@/lib/types/database";
import { DOMAIN_DISPLAY_CONFIG } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const DOMAIN_OPTIONS: IndulgeDomain[] = [
  "indulge_concierge",
  "indulge_house",
  "indulge_shop",
  "indulge_legacy",
];

interface EditUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  profile: Profile;
}

const ROLE_OPTIONS: {
  value: UserRole;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}[] = [
  { value: "agent",   label: "Agent",   icon: User,     color: "#2C6FAC", bg: "#E8F0FA" },
  { value: "manager", label: "Manager", icon: Briefcase, color: "#6B4FBB", bg: "#F0EBFF" },
  { value: "founder", label: "Founder", icon: Briefcase, color: "#4A7C59", bg: "#EBF4EF" },
  { value: "admin",   label: "Admin",   icon: Shield,    color: "#C5830A", bg: "#FEF3D0" },
  { value: "guest",   label: "Guest",   icon: User,      color: "#6B7280", bg: "#F4F4F5" },
];

export function EditUserModal({ open, onClose, onSuccess, profile }: EditUserModalProps) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [role, setRole] = useState<UserRole>(profile.role);
  const [domain, setDomain] = useState<IndulgeDomain>(() => {
    const d = profile.domain as string;
    if (d === "the_indulge_house") return "indulge_house";
    return DOMAIN_OPTIONS.includes(d as IndulgeDomain) ? (d as IndulgeDomain) : "indulge_concierge";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && profile) {
      setFullName(profile.full_name);
      setRole(profile.role);
      const d = profile.domain as string;
      setDomain(
        d === "the_indulge_house"
          ? "indulge_house"
          : DOMAIN_OPTIONS.includes(d as IndulgeDomain)
            ? (d as IndulgeDomain)
            : "indulge_concierge"
      );
    }
  }, [open, profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = updateUserProfileSchema.safeParse({
      full_name: fullName.trim(),
      role,
      domain,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your input.");
      return;
    }

    setLoading(true);

    const result = await updateUserProfile(profile.id, parsed.data);

    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Failed to update user.");
      return;
    }

    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update name and role for{" "}
            <span className="font-medium text-[#1A1A1A]">{profile.full_name}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={domain} onValueChange={(v) => setDomain(v as IndulgeDomain)}>
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {DOMAIN_OPTIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DOMAIN_DISPLAY_CONFIG[d]?.shortLabel ?? d.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="grid grid-cols-3 gap-2">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all",
                    role === opt.value
                      ? "border-[#D4AF37] bg-[#D4AF37]/8"
                      : "border-[#E5E4DF] hover:border-[#D0C8BE]"
                  )}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: opt.bg }}
                  >
                    <opt.icon className="w-3.5 h-3.5" style={{ color: opt.color }} />
                  </div>
                  <p
                    className={cn(
                      "text-xs font-semibold",
                      role === opt.value ? "text-[#A88B25]" : "text-[#1A1A1A]"
                    )}
                  >
                    {opt.label}
                  </p>
                </button>
              ))}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="gold" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
