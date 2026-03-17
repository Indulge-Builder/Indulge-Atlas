"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Loader2, UserPlus, Shield, User, Briefcase } from "lucide-react";
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
import { createUser } from "@/lib/actions/admin";
import { createUserSchema } from "@/lib/validations/user";
import type { IndulgeDomain, UserRole } from "@/lib/types/database";
import { DOMAIN_DISPLAY_CONFIG } from "@/lib/types/database";
import { cn } from "@/lib/utils";

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DOMAIN_OPTIONS: IndulgeDomain[] = [
  "indulge_global",
  "indulge_house",
  "indulge_shop",
  "indulge_legacy",
];

const ROLE_OPTIONS: {
  value: UserRole;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}[] = [
  {
    value: "agent",
    label: "Sales Agent",
    description: "Handles leads, pipeline & tasks",
    icon: User,
    color: "#2C6FAC",
    bg: "#E8F0FA",
  },
  {
    value: "scout",
    label: "Scout",
    description: "All agent access + team oversight",
    icon: Briefcase,
    color: "#6B4FBB",
    bg: "#F0EBFF",
  },
  {
    value: "finance",
    label: "Finance",
    description: "Finance & reporting access",
    icon: Briefcase,
    color: "#4A7C59",
    bg: "#EBF4EF",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Full system access & user management",
    icon: Shield,
    color: "#C5830A",
    bg: "#FEF3D0",
  },
];

export function CreateUserModal({ open, onClose, onSuccess }: CreateUserModalProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("agent");
  const [domain, setDomain] = useState<IndulgeDomain>("indulge_global");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("agent");
    setDomain("indulge_global");
    setShowPassword(false);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = createUserSchema.safeParse({
      email,
      password,
      full_name: fullName,
      role,
      domain,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your input.");
      return;
    }

    setLoading(true);

    const result = await createUser(parsed.data);

    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Failed to create user.");
      return;
    }

    reset();
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/25 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <DialogTitle className="text-lg">Create New User</DialogTitle>
          </div>
          <DialogDescription>
            The user will be able to log in immediately with the credentials you set.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Full name */}
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input
              placeholder="e.g. Sarah Al-Mansoori"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label>Email address</Label>
            <Input
              type="email"
              placeholder="agent@indulgeglobal.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {/* Department */}
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={domain} onValueChange={(v) => setDomain(v as IndulgeDomain)} required>
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
            <p className="text-[11px] text-[#B5A99A]">
              Determines which leads and tasks the user can access.
            </p>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B5A99A] hover:text-[#6B6B6B] transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-[#B5A99A]">
              Share this securely. The user can change it after logging in.
            </p>
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="grid grid-cols-3 gap-2">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center",
                    role === opt.value
                      ? "border-[#D4AF37] bg-[#D4AF37]/8"
                      : "border-[#E5E4DF] hover:border-[#D0C8BE] bg-white"
                  )}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: opt.bg }}
                  >
                    <opt.icon className="w-4 h-4" style={{ color: opt.color }} />
                  </div>
                  <p
                    className={cn(
                      "text-xs font-semibold",
                      role === opt.value ? "text-[#A88B25]" : "text-[#1A1A1A]"
                    )}
                  >
                    {opt.label}
                  </p>
                  <p className="text-[10px] text-[#9E9E9E] leading-tight">
                    {opt.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-sm text-[#C0392B] bg-[#FAEAE8] border border-[#C0392B]/20 rounded-lg px-3 py-2.5"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#C0392B] shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" variant="gold" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Create User
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
