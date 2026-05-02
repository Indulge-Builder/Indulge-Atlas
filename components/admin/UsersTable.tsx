"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MoreHorizontal,
  Pencil,
  Power,
  KeyRound,
  Trash2,
  UserPlus,
  Shield,
  Briefcase,
  User,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateUserModal } from "@/components/admin/CreateUserModal";
import { EditUserModal } from "@/components/admin/EditUserModal";
import {
  updateUserProfile,
  sendPasswordReset,
  deleteUser,
} from "@/lib/actions/admin";
import { getInitials, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { mapAuthError } from "@/lib/utils/auth-errors";
import type { Profile, UserRole } from "@/lib/types/database";
import { DOMAIN_DISPLAY_CONFIG } from "@/lib/types/database";

const ROLE_CONFIG: Record<
  UserRole,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  admin:        { label: "Admin",        icon: Shield,    color: "#C5830A", bg: "#FEF3D0" },
  founder:      { label: "Founder",      icon: Briefcase, color: "#4A7C59", bg: "#EBF4EF" },
  super_admin:  { label: "Super Admin",  icon: Shield,    color: "#8B6914", bg: "#FBF5DC" },
  manager:      { label: "Manager",      icon: Briefcase, color: "#6B4FBB", bg: "#F0EBFF" },
  agent:        { label: "Agent",        icon: User,      color: "#2C6FAC", bg: "#E8F0FA" },
  guest:        { label: "Guest",        icon: User,      color: "#6B7280", bg: "#F4F4F5" },
};

/** Legacy role mappings (from older schema) */
const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  sales_agent: "agent",
  finance:     "guest",
};

function getRoleConfig(role: string | null | undefined) {
  if (!role) return ROLE_CONFIG.agent;
  const mapped = LEGACY_ROLE_MAP[role] ?? (role as UserRole);
  return ROLE_CONFIG[mapped] ?? ROLE_CONFIG.agent;
}

interface UsersTableProps {
  profiles: Profile[];
  currentUserId: string;
}

export function UsersTable({ profiles: initialProfiles, currentUserId }: UsersTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");
  const [processingId, setProcessingId] = useState<string | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToastType(type);
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  function refreshData() {
    startTransition(() => router.refresh());
  }

  async function handleToggleActive(profile: Profile) {
    setProcessingId(profile.id);
    const result = await updateUserProfile(profile.id, {
      is_active: !profile.is_active,
    });
    setProcessingId(null);

    if (result.success) {
      showToast(
        profile.is_active
          ? `${profile.full_name} deactivated.`
          : `${profile.full_name} reactivated.`
      );
      refreshData();
    } else {
      showToast(mapAuthError(result.error ?? null), "error");
    }
  }

  async function handlePasswordReset(profile: Profile) {
    setProcessingId(profile.id);
    const result = await sendPasswordReset(profile.email);
    setProcessingId(null);
    if (result.success) {
      showToast(`Password reset email sent to ${profile.email}.`);
    } else {
      showToast(mapAuthError(result.error ?? null), "error");
    }
  }

  async function handleDelete(profile: Profile) {
    if (
      !confirm(
        `Permanently delete ${profile.full_name}? This cannot be undone.`
      )
    )
      return;

    setProcessingId(profile.id);
    const result = await deleteUser(profile.id);
    setProcessingId(null);

    if (result.success) {
      showToast(`${profile.full_name} has been deleted.`);
      refreshData();
    } else {
      showToast(mapAuthError(result.error ?? null), "error");
    }
  }

  const activeCount = profiles.filter((p) => p.is_active).length;
  const agentCount = profiles.filter((p) => p.role === "agent").length;

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Users", value: profiles.length, color: "#1A1A1A", bg: "#F2F2EE" },
          { label: "Active", value: activeCount, color: "#4A7C59", bg: "#EBF4EF" },
          { label: "Sales Agents", value: agentCount, color: "#2C6FAC", bg: "#E8F0FA" },
          {
            label: "Admins & Managers",
            value: profiles.filter((p) => p.role !== "agent").length,
            color: "#C5830A",
            bg: "#FEF3D0",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-[#E5E4DF] shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-lg"
              style={{ backgroundColor: stat.bg, color: stat.color }}
            >
              {stat.value}
            </div>
            <p className="text-xs text-[#9E9E9E]">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-[#E5E4DF] overflow-hidden shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        {/* Table header bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E4DF]">
          <div>
            <h2 className="text-sm font-semibold text-[#1A1A1A]">Team Members</h2>
            <p className="text-xs text-[#9E9E9E] mt-0.5">
              {profiles.length} user{profiles.length !== 1 ? "s" : ""} total
            </p>
          </div>
          <Button
            variant="gold"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowCreate(true)}
          >
            <UserPlus className="w-3.5 h-3.5" />
            New User
          </Button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E4DF] bg-[#F9F9F6]">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider">
                User
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider">
                Role
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider">
                Department
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider">
                Joined
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {profiles.map((profile, i) => {
                const roleConfig = getRoleConfig(profile.role);
                const RoleIcon = roleConfig.icon;
                const isSelf = profile.id === currentUserId;
                const isProcessing = processingId === profile.id;

                return (
                  <motion.tr
                    key={profile.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={cn(
                      "border-b border-[#F2F2EE] last:border-0 transition-colors",
                      !profile.is_active && "opacity-50"
                    )}
                  >
                    {/* User */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={undefined} />
                          <AvatarFallback
                            className="text-xs font-semibold"
                            style={{
                              backgroundColor: roleConfig.bg,
                              color: roleConfig.color,
                            }}
                          >
                            {getInitials(profile.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-[#1A1A1A]">
                              {profile.full_name}
                            </p>
                            {isSelf && (
                              <span className="text-[10px] bg-[#D4AF37]/15 text-[#A88B25] px-1.5 py-0.5 rounded-full font-medium">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#9E9E9E]">{profile.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3.5">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{
                          backgroundColor: roleConfig.bg,
                          color: roleConfig.color,
                        }}
                      >
                        <RoleIcon className="w-3 h-3" />
                        {roleConfig.label}
                      </span>
                    </td>

                    {/* Department */}
                    <td className="px-4 py-3.5">
                      {profile.domain ? (
                        <span
                          className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full"
                          style={{
                            backgroundColor: DOMAIN_DISPLAY_CONFIG[profile.domain]?.pillBg ?? "#F4F4F5",
                            color: DOMAIN_DISPLAY_CONFIG[profile.domain]?.pillColor ?? "#6B7280",
                          }}
                        >
                          {DOMAIN_DISPLAY_CONFIG[profile.domain]?.shortLabel ?? profile.domain.replace(/_/g, " ")}
                        </span>
                      ) : (
                        <span className="text-xs text-[#9E9E9E]">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full",
                          profile.is_active
                            ? "bg-[#EBF4EF] text-[#4A7C59]"
                            : "bg-[#F5F5F5] text-[#9E9E9E]"
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            profile.is_active ? "bg-[#4A7C59]" : "bg-[#9E9E9E]"
                          )}
                        />
                        {profile.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {/* Joined */}
                    <td className="px-4 py-3.5 text-xs text-[#B5A99A]">
                      {formatDate(profile.created_at)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      {isProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#B5A99A]" />
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-[#B5A99A]"
                              disabled={isSelf}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>
                              {profile.full_name}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => setEditTarget(profile)}
                            >
                              <Pencil className="w-3.5 h-3.5 text-[#6B6B6B]" />
                              Edit name, role &amp; department
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => handlePasswordReset(profile)}
                            >
                              <KeyRound className="w-3.5 h-3.5 text-[#6B6B6B]" />
                              Send password reset
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              className={cn(
                                "gap-2",
                                profile.is_active
                                  ? "text-[#C5830A] focus:bg-[#FEF3D0]"
                                  : "text-[#4A7C59] focus:bg-[#EBF4EF]"
                              )}
                              onClick={() => handleToggleActive(profile)}
                            >
                              <Power className="w-3.5 h-3.5" />
                              {profile.is_active ? "Deactivate user" : "Reactivate user"}
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              className="gap-2 text-[#C0392B] focus:bg-[#FAEAE8]"
                              onClick={() => handleDelete(profile)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete permanently
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <CreateUserModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => {
          setShowCreate(false);
          showToast("User created successfully.");
          refreshData();
        }}
      />

      {editTarget && (
        <EditUserModal
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            setEditTarget(null);
            showToast("User updated successfully.");
            refreshData();
          }}
          profile={editTarget}
        />
      )}

      {/* Toast notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-[#1A1A1A] text-white text-sm px-4 py-3 rounded-xl shadow-2xl border border-[#2A2A2A]"
          >
            <div
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                toastType === "error" ? "bg-[#C0392B]" : "bg-[#4A7C59]"
              )}
            >
              <Check className="w-3 h-3 text-white" />
            </div>
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────

export function UsersTableSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-[#E5E4DF] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E4DF] flex justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-[#F2F2EE] last:border-0">
            <Skeleton className="w-8 h-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
