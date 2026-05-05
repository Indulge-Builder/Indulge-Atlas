import type { ClientDetail } from "@/lib/actions/clients";
import { ProfileFieldRow } from "@/components/clients/profile/ProfileFieldRow";
import { ProfilePhoneCopy } from "@/components/clients/profile/ProfilePhoneCopy";
import { ProfileSection } from "@/components/clients/profile/ProfileSection";
import { surfaceCardVariants } from "@/components/ui/card";
import { formatIST } from "@/lib/utils/time";
import { cn } from "@/lib/utils";
import {
  CalendarRange,
  CreditCard,
  Crown,
  Heart,
  Mail,
  Phone,
} from "lucide-react";
import { formatDistanceStrict, isAfter, isBefore, parseISO } from "date-fns";

function hasText(v: unknown): boolean {
  return v != null && String(v).trim() !== "";
}

function computeMembershipTimeline(d: ClientDetail): {
  start: Date | null;
  end: Date | null;
  phase: "empty" | "partial" | "upcoming" | "active" | "expired";
  durationLabel: string | null;
  progressPct: number | null;
} {
  let start: Date | null = null;
  let end: Date | null = null;
  try {
    if (d.membership_start?.trim()) {
      start = parseISO(`${d.membership_start}T12:00:00`);
    }
    if (d.membership_end?.trim()) {
      end = parseISO(`${d.membership_end}T12:00:00`);
    }
  } catch {
    start = null;
    end = null;
  }

  const now = new Date();
  type Phase = "empty" | "partial" | "upcoming" | "active" | "expired";
  let phase: Phase = "empty";
  let durationLabel: string | null = null;
  let progressPct: number | null = null;

  if (!start && !end) {
    phase = "empty";
  } else if (start && end) {
    durationLabel = formatDistanceStrict(end, start, { roundingMethod: "floor" });
    if (isBefore(now, start)) {
      phase = "upcoming";
      progressPct = 0;
    } else if (isAfter(now, end)) {
      phase = "expired";
      progressPct = 100;
    } else {
      phase = "active";
      const span = end.getTime() - start.getTime();
      progressPct =
        span > 0
          ? Math.round(
              Math.min(
                100,
                Math.max(0, ((now.getTime() - start.getTime()) / span) * 100),
              ),
            )
          : null;
    }
  } else {
    phase = "partial";
  }

  return { start, end, phase, durationLabel, progressPct };
}

function formatAmountPaid(d: ClientDetail): string {
  if (d.membership_amount_paid == null) return "";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(d.membership_amount_paid));
}

export interface ClientMembershipTabProps {
  detail: ClientDetail;
  /** When false, hides Contact — use under Profile tab where contact lives above. */
  showContact?: boolean;
}

export function ClientMembershipTab({
  detail: d,
  showContact = true,
}: ClientMembershipTabProps) {
  const membershipTimeline = computeMembershipTimeline(d);
  const amountFormatted = formatAmountPaid(d);

  return (
    <div className="pb-2">
      <ProfileSection title="Plan" icon={CreditCard}>
        <ProfileFieldRow
          label="Membership type"
          icon={CreditCard}
          isEmpty={!hasText(d.membership_type)}
          value={hasText(d.membership_type) ? d.membership_type : null}
        />
        <ProfileFieldRow
          label="Plan interval"
          icon={CalendarRange}
          isEmpty={!hasText(d.membership_interval)}
          value={hasText(d.membership_interval) ? d.membership_interval : null}
        />
        <ProfileFieldRow
          label="Amount paid"
          icon={CreditCard}
          isEmpty={d.membership_amount_paid == null}
          value={
            amountFormatted ? (
              <span className="tabular-nums">{amountFormatted}</span>
            ) : null
          }
        />
        <ProfileFieldRow
          label="Membership status"
          icon={Heart}
          isEmpty={!hasText(d.membership_status)}
          value={hasText(d.membership_status) ? d.membership_status : null}
        />
        <ProfileFieldRow
          label="Queendom"
          icon={Crown}
          isEmpty={!hasText(d.queendom)}
          value={hasText(d.queendom) ? d.queendom : null}
        />
      </ProfileSection>

      <ProfileSection title="Timeline" icon={CalendarRange}>
        <div className="p-4">
          {membershipTimeline.phase === "empty" ? (
            <div
              className={cn(
                surfaceCardVariants({ tone: "stone", elevation: "xs" }),
                "px-4 py-6 text-center text-sm text-stone-500",
              )}
            >
              No membership start or end dates on file.
            </div>
          ) : (
            <div
              className={cn(
                surfaceCardVariants({ tone: "stone", elevation: "xs" }),
                "overflow-visible p-4 sm:p-5",
              )}
            >
              {membershipTimeline.phase !== "partial" &&
                membershipTimeline.durationLabel && (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E4DF]/80 pb-3">
                    <p className="text-xs text-stone-600">
                      <span className="font-medium text-stone-800">
                        {membershipTimeline.durationLabel}
                      </span>
                      <span className="text-stone-500"> · planned term</span>
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
                        membershipTimeline.phase === "active" &&
                          "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80",
                        membershipTimeline.phase === "upcoming" &&
                          "bg-sky-50 text-sky-900 ring-1 ring-sky-200/80",
                        membershipTimeline.phase === "expired" &&
                          "bg-stone-200/80 text-stone-700 ring-1 ring-stone-300/80",
                      )}
                    >
                      {membershipTimeline.phase === "active" && "Active"}
                      {membershipTimeline.phase === "upcoming" && "Upcoming"}
                      {membershipTimeline.phase === "expired" && "Ended"}
                    </span>
                  </div>
                )}

              {membershipTimeline.phase === "partial" && (
                <p className="mb-4 text-xs text-stone-500">
                  Add both dates to see term length and status.
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div
                  className={cn(
                    surfaceCardVariants({ tone: "luxury", elevation: "none" }),
                    "border-[#EAE8E3] p-4 text-center sm:text-left",
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                    Start
                  </p>
                  {membershipTimeline.start ? (
                    <>
                      <p className="mt-2 font-[family-name:var(--font-playfair)] text-xl font-semibold tabular-nums text-stone-900">
                        {formatIST(membershipTimeline.start, "MMMM yyyy")}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-stone-500">
                        {formatIST(
                          membershipTimeline.start,
                          "EEE · d MMM yyyy",
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm font-medium text-stone-400">
                      Not provided
                    </p>
                  )}
                </div>

                <div
                  className={cn(
                    surfaceCardVariants({ tone: "luxury", elevation: "none" }),
                    "border-[#EAE8E3] p-4 text-center sm:text-right",
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                    End
                  </p>
                  {membershipTimeline.end ? (
                    <>
                      <p className="mt-2 font-[family-name:var(--font-playfair)] text-xl font-semibold tabular-nums text-stone-900">
                        {formatIST(membershipTimeline.end, "MMMM yyyy")}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-stone-500">
                        {formatIST(membershipTimeline.end, "EEE · d MMM yyyy")}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm font-medium text-stone-400">
                      Not provided
                    </p>
                  )}
                </div>
              </div>

              {membershipTimeline.phase !== "partial" &&
                membershipTimeline.progressPct != null && (
                  <div className="mt-5 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-stone-500">
                      <span>Term progress</span>
                      <span className="tabular-nums font-medium text-stone-700">
                        {membershipTimeline.progressPct}%
                      </span>
                    </div>
                    <div
                      className="relative h-2.5 overflow-hidden rounded-full bg-stone-200/90 shadow-inner"
                      role="progressbar"
                      aria-valuenow={membershipTimeline.progressPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Membership term elapsed"
                    >
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width]",
                          membershipTimeline.phase === "expired" &&
                            "bg-stone-500/85",
                          membershipTimeline.phase === "upcoming" &&
                            "bg-sky-400/90",
                          membershipTimeline.phase === "active" &&
                            "bg-brand-gold shadow-[0_0_0_1px_rgb(0_0_0/0.04)]",
                        )}
                        style={{
                          width: `${membershipTimeline.progressPct}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      </ProfileSection>

      {showContact ? (
      <ProfileSection title="Contact" icon={Phone}>
        <ProfileFieldRow
          label="Phone"
          icon={Phone}
          isEmpty={!d.phone_number?.trim()}
          value={<ProfilePhoneCopy rawPhone={d.phone_number} />}
        />
        <ProfileFieldRow
          label="Email"
          icon={Mail}
          isEmpty={!d.email?.trim()}
          value={
            d.email?.trim() ? (
              <a
                href={`mailto:${d.email.trim()}`}
                className="break-all text-[13px] font-normal text-[#D4AF37] hover:underline"
              >
                {d.email.trim()}
              </a>
            ) : null
          }
        />
      </ProfileSection>
      ) : null}
    </div>
  );
}
