"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
import { EditProfileModal } from "./EditProfileModal";
import { ChangePasswordModal } from "./ChangePasswordModal";
import type { Profile, UserRole } from "@/lib/types/database";

// ── Role display names ────────────────────────────────────────

const ROLE_DISPLAY: Record<UserRole, string> = {
  agent:   "Elite Agent",
  scout:   "Strategic Scout",
  admin:   "System Administrator",
  finance: "Finance",
};

const ROLE_DIVISION: Record<UserRole, string> = {
  agent:   "Indulge Global · Onboarding",
  scout:   "Indulge Global · Performance",
  admin:   "Indulge Global · Administration",
  finance: "Indulge Global · Finance",
};

// ── Date helpers ──────────────────────────────────────────────
// Parse a YYYY-MM-DD date-only string as local time to avoid
// UTC-offset shifting the day by one.

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDob(dob: string): string {
  return format(parseLocalDate(dob), "MMMM d, yyyy");
}

function formatJoined(iso: string): string {
  return format(new Date(iso), "MMMM yyyy");
}

// ── Framer Motion variants ────────────────────────────────────

const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.09, delayChildren: 0.08 },
  },
};

const item = {
  hidden:  { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.52,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  },
};

// ── Field component ───────────────────────────────────────────
// Renders a label in tracked-out editorial caps + value below it.

function Field({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] font-semibold text-[#9E9E9E] uppercase tracking-[0.2em] mb-1.5">
        {label}
      </p>
      <p
        className={cn(
          "text-sm leading-snug font-medium",
          muted ? "text-[#C0BDB5] italic" : "text-[#1A1A1A]"
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

interface ProfileDossierProps {
  profile: Profile;
}

export function ProfileDossier({ profile }: ProfileDossierProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const initials = getInitials(profile.full_name);

  return (
    <>
      {/* Page wrapper — warm linen tone sits above the paper */}
      <div className="min-h-[calc(100vh-65px)] bg-[#EDEAE5] flex flex-col items-center justify-center px-6 py-12">
        {/* ── The Dossier Card ───────────────────────────────── */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className={cn(
            "w-full max-w-xl bg-[#F9F9F6] rounded-3xl overflow-hidden",
            "shadow-[0_12px_48px_rgba(0,0,0,0.10),0_4px_12px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.85)]"
          )}
        >
          {/* ── Hero Section ─────────────────────────────────── */}
          <div className="px-10 pt-12 pb-8 flex flex-col items-center text-center bg-gradient-to-b from-[#EDE9E2] to-[#F9F9F6]">
            {/* Avatar */}
            <motion.div variants={item}>
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-[#D4AF37] text-2xl font-semibold mb-5 ring-[1.5px] ring-[#D4AF37]/30 ring-offset-2 ring-offset-[#EDE9E2]"
                style={{
                  fontFamily: "var(--font-playfair)",
                  background:
                    "linear-gradient(135deg, #1A1812 0%, #2A2218 55%, #1A1A1A 100%)",
                }}
              >
                {initials}
              </div>
            </motion.div>

            {/* Name */}
            <motion.h2
              variants={item}
              className="text-[#1A1A1A] text-2xl font-semibold leading-snug tracking-tight"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {profile.full_name}
            </motion.h2>

            {/* Role badge */}
            <motion.p
              variants={item}
              className="text-[11px] font-medium text-[#D4AF37] tracking-[0.16em] mt-1.5 uppercase"
            >
              {ROLE_DISPLAY[profile.role]}
            </motion.p>
          </div>

          {/* ── Divider ───────────────────────────────────────── */}
          <motion.div
            variants={item}
            className="h-px bg-[#1A1A1A]/[0.07] mx-10"
          />

          {/* ── Details Grid ──────────────────────────────────── */}
          <motion.div
            variants={item}
            className="px-10 py-8 grid grid-cols-2 gap-x-10 gap-y-7"
          >
            <Field label="Email" value={profile.email} />

            <Field
              label="Phone"
              value={profile.phone ?? "Not provided"}
              muted={!profile.phone}
            />

            <Field
              label="Date of Birth"
              value={profile.dob ? formatDob(profile.dob) : "Not provided"}
              muted={!profile.dob}
            />

            <Field label="Division" value={ROLE_DIVISION[profile.role]} />

            <Field
              label="Member Since"
              value={`Joined ${formatJoined(profile.created_at)}`}
            />
          </motion.div>

          {/* ── Divider ───────────────────────────────────────── */}
          <div className="h-px bg-[#1A1A1A]/[0.07] mx-10" />

          {/* ── Action Footer ─────────────────────────────────── */}
          <motion.div
            variants={item}
            className="px-10 py-7 flex items-center justify-between"
          >
            {/* Account status indicator */}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  profile.is_active ? "bg-[#4A7C59]" : "bg-[#9E9E9E]"
                )}
              />
              <span className="text-[10px] text-[#9E9E9E] font-medium uppercase tracking-[0.14em]">
                {profile.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            {/* Update button */}
            <button
              onClick={() => setEditOpen(true)}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-medium tracking-[0.02em]",
                "border border-[#1A1A1A]/18 text-[#1A1A1A]/60",
                "hover:bg-[#1A1A1A] hover:text-white hover:border-transparent",
                "transition-all duration-200"
              )}
            >
              Update Details
            </button>
          </motion.div>
        </motion.div>

        {/* ── Security Section ───────────────────────────────────────── */}
        <motion.div
          variants={item}
          className="mt-8 w-full max-w-xl"
        >
          <div
            className={cn(
              "rounded-2xl p-6 border",
              "border-[#1A1A1A]/[0.08] bg-white/60"
            )}
          >
            <p className="text-[9px] font-semibold text-[#9E9E9E] uppercase tracking-[0.2em] mb-3">
              Security
            </p>
            <button
              onClick={() => setChangePasswordOpen(true)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-medium tracking-[0.02em]",
                "border border-[#1A1A1A]/25 text-[#1A1A1A]/80",
                "hover:bg-[#1A1A1A] hover:text-white hover:border-transparent",
                "transition-all duration-200"
              )}
            >
              Change Password
            </button>
          </div>
        </motion.div>
      </div>

      {/* Edit modal */}
      <EditProfileModal
        profile={profile}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />

      {/* Change password modal */}
      <ChangePasswordModal
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </>
  );
}
