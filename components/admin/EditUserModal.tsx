"use client";

import { useState } from "react";
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
import { updateUserProfile } from "@/lib/actions/admin";
import type { Profile, UserRole } from "@/lib/types/database";
import { cn } from "@/lib/utils";

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
  { value: "agent", label: "Sales Agent", icon: User, color: "#2C6FAC", bg: "#E8F0FA" },
  { value: "scout", label: "Scout", icon: Briefcase, color: "#6B4FBB", bg: "#F0EBFF" },
  { value: "admin", label: "Admin", icon: Shield, color: "#C5830A", bg: "#FEF3D0" },
  { value: "finance", label: "Finance", icon: Briefcase, color: "#4A7C59", bg: "#EBF4EF" },
];

export function EditUserModal({ open, onClose, onSuccess, profile }: EditUserModalProps) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [role, setRole] = useState<UserRole>(profile.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await updateUserProfile(profile.id, {
      full_name: fullName.trim(),
      role,
    });

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
