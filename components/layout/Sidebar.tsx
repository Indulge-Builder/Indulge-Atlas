"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  CalendarDays,
  MessageSquare,
  LogOut,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  BarChart3,
  Megaphone,
  UsersRound,
  Coffee,
  Award,
  Compass,
  Trophy,
  AlertTriangle,
  Globe,
  ShoppingBag,
  Route,
  Workflow,
  Brain,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { DOMAIN_DISPLAY_CONFIG } from "@/lib/types/database";
import { canAccessShopSurfaces } from "@/lib/shop/access";
import {
  DEPARTMENT_CONFIG,
  DEPARTMENT_ROUTE_ACCESS,
  isDepartmentRoute,
} from "@/lib/constants/departments";
import { NotificationBell } from "@/components/notifications/NotificationBell";

// ── Nav definition ─────────────────────────────────────────
// `exact: true` forces pathname === href for active detection.
// Use this for parent routes that would otherwise match all children
// (e.g. /manager would incorrectly match /manager/dashboard).

// Roles that can mutate data — used for canEdit guardrail in UI
export const MUTABLE_ROLES = ["admin", "founder", "manager", "agent"] as const;
export type MutableRole = (typeof MUTABLE_ROLES)[number];

export function canEdit(role: string): boolean {
  return (MUTABLE_ROLES as readonly string[]).includes(role);
}

const navItems = [
  {
    href: "/workspace",
    label: "Workspace",
    icon: Compass,
    roles: ["agent", "manager", "founder", "admin"],
    section: "main",
  },
  {
    href: "/shop/workspace",
    label: "Shop Workspace",
    icon: ShoppingBag,
    roles: ["agent", "manager", "founder", "admin"],
    section: "main",
    shopOnly: true,
  },
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["agent", "manager", "founder"],
    section: "main",
  },
  {
    href: "/leads",
    label: "All Leads",
    icon: Users,
    roles: ["agent", "manager", "founder", "guest"],
    section: "main",
  },
  {
    href: "/whatsapp",
    label: "WhatsApp Hub",
    icon: MessageSquare,
    roles: ["agent", "manager", "founder", "admin"],
    section: "main",
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: CheckSquare,
    roles: ["agent", "manager", "founder", "admin"],
    section: "main",
  },
  {
    href: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
    roles: ["agent", "manager", "founder", "admin"],
    section: "main",
  },
  {
    href: "/performance",
    label: "My Performance",
    icon: Award,
    roles: ["agent"],
    section: "main",
  },
  {
    href: "/conversions",
    label: "My Conversions",
    icon: Trophy,
    roles: ["agent"],
    section: "main",
  },
  {
    href: "/escalations",
    label: "Escalations",
    icon: AlertTriangle,
    roles: ["agent"],
    section: "main",
  },
  {
    href: "/manager/campaigns",
    label: "Live Campaigns",
    icon: Megaphone,
    roles: ["manager", "founder"],
    section: "manager",
  },
  {
    href: "/manager/team",
    label: "Team Roster",
    icon: UsersRound,
    roles: ["manager", "founder"],
    section: "manager",
  },
  {
    href: "/manager",
    label: "Morning Briefing",
    icon: Coffee,
    roles: ["manager", "founder"],
    section: "manager",
    exact: true,
  },
  {
    href: "/manager/dashboard",
    label: "Command Center",
    icon: BarChart3,
    roles: ["manager", "founder"],
    section: "manager",
  },
  {
    href: "/task-insights",
    label: "Task Insights",
    icon: Activity,
    roles: ["manager", "founder", "admin"],
    section: "manager",
  },
  {
    href: "/manager/planner",
    label: "Ad Planner",
    icon: Sparkles,
    roles: ["manager", "founder"],
    section: "manager",
  },
  {
    href: "/concierge",
    label: "Elia · Concierge",
    icon: Brain,
    roles: ["admin", "founder"],
    section: "admin",
  },
  {
    href: "/indulge-world",
    label: "Indulge Eco",
    icon: Globe,
    roles: ["admin", "founder"],
    section: "admin",
  },
  {
    href: "/admin/onboarding",
    label: "Onboarding Oversight",
    icon: BarChart3,
    roles: ["admin", "founder"],
    section: "admin",
  },
  {
    href: "/admin/conversions",
    label: "Conversions",
    icon: Trophy,
    roles: ["admin", "founder"],
    section: "admin",
  },
  {
    href: "/admin/shop",
    label: "Shop Operations",
    icon: ShoppingBag,
    roles: ["admin", "founder"],
    section: "admin",
  },
  {
    href: "/admin/shop/workspace",
    label: "Shop Workspace",
    icon: ShoppingBag,
    roles: ["admin", "founder"],
    section: "admin",
  },
  {
    href: "/admin/marketing",
    label: "Marketing Oversight",
    icon: Megaphone,
    roles: ["admin", "founder"],
    section: "admin",
  },
  {
    href: "/admin/routing",
    label: "Lead Routing",
    icon: Route,
    roles: ["admin", "founder", "manager"],
    section: "admin",
    exact: true,
  },
  {
    href: "/admin/integrations",
    label: "Data Pipeline",
    icon: Workflow,
    roles: ["admin"],
    section: "admin",
  },
  {
    href: "/admin",
    label: "User Management",
    icon: ShieldCheck,
    roles: ["admin", "founder"],
    section: "admin",
    exact: true,
  },
];

interface SidebarProps {
  profile: Profile;
}

// ── Individual nav link ────────────────────────────────────

function NavItem({
  href,
  label,
  icon: Icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  isActive: boolean;
}) {
  return (
    <Link href={href} className="block">
      <motion.div
        whileHover={{ x: 3 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer",
          "transition-colors duration-300",
          isActive
            ? "bg-[#D4AF37]/10 border border-[#D4AF37]/18 text-[#D4AF37]"
            : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]",
        )}
      >
        {/* Subtle inner glow line on active items */}
        {isActive && (
          <motion.span
            layoutId="active-pill"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-[#D4AF37]/70"
          />
        )}

        <Icon
          className={cn(
            "w-[15px] h-[15px] shrink-0 transition-colors duration-150",
            isActive
              ? "text-[#D4AF37]"
              : "text-white/30 group-hover:text-white/70",
          )}
        />

        <span className="text-[13px] font-medium tracking-[0.01em]">
          {label}
        </span>

        {isActive && (
          <ChevronRight className="w-3 h-3 ml-auto text-[#D4AF37]/50 shrink-0" />
        )}
      </motion.div>
    </Link>
  );
}

// ── Section group ──────────────────────────────────────────

function NavSection({
  label,
  items,
  pathname,
}: {
  label: string;
  items: typeof navItems;
  pathname: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="pt-4">
      {/* Hairline divider */}
      <div className="h-px bg-white/[0.07] mx-2 mb-3" />
      <p className="px-3 mb-2 text-[10px] font-semibold text-white/[0.2] uppercase tracking-[0.12em]">
        {label}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const isActive =
            item.href === "/" || (item as { exact?: boolean }).exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={isActive}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Admin and founder bypass all department filtering — they see everything.
  const isGlobalRole = profile.role === "admin" || profile.role === "founder";
  const deptRoutes =
    !isGlobalRole && profile.department
      ? DEPARTMENT_ROUTE_ACCESS[profile.department]
      : null;

  const visible = navItems.filter((item) => {
    // 1. Role gate (always applied first).
    if (!item.roles.includes(profile.role)) return false;

    // 2. Shop-only items: require shop domain access.
    if ((item as { shopOnly?: boolean }).shopOnly) {
      if (!canAccessShopSurfaces(profile)) return false;
      if (profile.role === "admin") return false;
      return true;
    }

    // 3. Department route gate (non-admin/founder with a department set).
    //    If department is null (safety fallback for edge cases) skip this gate.
    if (deptRoutes !== null) {
      if (!isDepartmentRoute(item.href, deptRoutes)) return false;
    }

    return true;
  });

  const mainItems = visible.filter((i) => i.section === "main");
  const managerItems = visible.filter((i) => i.section === "manager");
  const adminItems = visible.filter((i) => i.section === "admin");

  return (
    /*
     * No background — inherits the layout-canvas texture directly.
     * No right border — the gap between sidebar and paper (from p-3
     * in layout.tsx) provides the visual separation.
     */
    <aside className="fixed left-0 top-0 h-full w-60 flex flex-col z-40">
      {/* ── Logo mark ──────────────────────────────────── */}
      <div className="px-5 pt-7 pb-5 flex flex-col items-center">
        <Link
          href="/"
          className="block cursor-pointer hover:opacity-90 transition-opacity"
        >
          <div
            style={{
              filter:
                "drop-shadow(0 0 8px rgba(212,175,55,0.30)) drop-shadow(0 0 18px rgba(212,175,55,0.12))",
            }}
          >
            <img
              src="/logo.svg"
              alt="Indulge Global"
              width={43}
              height={46}
              className="object-contain select-none"
            />
          </div>
        </Link>

        {/* Hairline divider */}
        <div
          className="mt-5 w-full"
          style={{
            height: "1px",
            background:
              "linear-gradient(to right, transparent, rgba(212,175,55,0.22) 30%, rgba(212,175,55,0.22) 70%, transparent)",
          }}
        />

        {/* ── Department / Domain badge (glassmorphic) ───── */}
        {(profile.department || profile.domain) &&
          (() => {
            const deptCfg = profile.department
              ? DEPARTMENT_CONFIG[profile.department]
              : null;
            const accentColor =
              deptCfg?.accentColor ??
              DOMAIN_DISPLAY_CONFIG[profile.domain]?.ringColor ??
              "rgba(212,175,55,0.4)";
            const workspaceLabel =
              deptCfg?.label ??
              DOMAIN_DISPLAY_CONFIG[profile.domain]?.label ??
              profile.domain.replace(/_/g, " ");
            const subLabel = deptCfg
              ? (profile.job_title ?? profile.role)
              : profile.domain.replace(/_/g, " ");

            return (
              <div
                className="mt-4 px-3 py-2 rounded-xl bg-white/[0.04] backdrop-blur-sm border border-white/[0.08]"
                style={{ boxShadow: `0 0 0 1px ${accentColor}40` }}
              >
                <p className="text-[10px] font-semibold text-white/[0.35] uppercase tracking-[0.14em]">
                  Workspace
                </p>
                <p className="text-[13px] font-medium text-white/90 mt-0.5 capitalize">
                  {workspaceLabel}
                </p>
                {subLabel && (
                  <p className="text-[10px] text-white/40 mt-0.5 truncate capitalize">
                    {subLabel}
                  </p>
                )}
              </div>
            );
          })()}
      </div>

      {/* ── Navigation ─────────────────────────────────── */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-0.5">
        {/* Main navigation label */}
        <p className="px-3 mb-2 text-[10px] font-semibold text-white/[0.2] uppercase tracking-[0.12em]">
          Navigation
        </p>

        {/* Main items */}
        <div className="space-y-0.5">
          {mainItems.map((item) => {
            const isActive =
              item.href === "/" || (item as { exact?: boolean }).exact
                ? pathname === item.href
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/");
            return (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={isActive}
              />
            );
          })}
        </div>

        {/* Manager section */}
        <NavSection
          label="Management"
          items={managerItems}
          pathname={pathname}
        />

        {/* Administration */}
        <NavSection
          label="Administration"
          items={adminItems}
          pathname={pathname}
        />
      </nav>

      {/* ── User profile footer ─────────────────────────── */}
      {/*
       * A very faint horizontal rule separates the nav from the profile row.
       * No solid border — just a 7 % white line that reads as a material
       * crease on the dark canvas.
       */}
      <div className="px-3 pb-5 pt-3">
        <div className="h-px bg-white/[0.07] mx-2 mb-4" />

        <div className="flex items-center gap-2">
          <NotificationBell userId={profile.id} />

          {/* Clicking name/avatar navigates to profile */}
          <Link
            href="/profile"
            className="flex items-center gap-3 flex-1 min-w-0 px-2 py-2 rounded-xl hover:bg-white/[0.04] transition-colors duration-150 group/profile"
          >
            <Avatar className="w-8 h-8 ring-1 ring-white/[0.1] flex-shrink-0">
              <AvatarImage src={undefined} />
              <AvatarFallback className="bg-[#D4AF37]/15 text-[#D4AF37]/90 text-xs font-semibold">
                {getInitials(profile.full_name)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <p className="text-white/80 text-[13px] font-medium truncate leading-none group-hover/profile:text-white/95 transition-colors duration-150">
                {profile.full_name}
              </p>
              <p className="text-white/[0.28] text-[10px] mt-0.5 capitalize truncate tracking-wide">
                {profile.role}
              </p>
            </div>
          </Link>

          <motion.button
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleSignOut}
            className="
              p-1.5 rounded-lg flex-shrink-0
              text-white/[0.25] hover:text-white/70
              hover:bg-white/[0.08]
              transition-colors duration-150
            "
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </div>
    </aside>
  );
}
