import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { LeaderPerspectiveNotice } from "@/components/layout/LeaderPerspectiveNotice";
import { ConversionsTable } from "@/components/leads/ConversionsTable";
import type { ConversionRow } from "@/components/leads/ConversionsTable";

export const dynamic = "force-dynamic";

// ── Auth + data ───────────────────────────────────────────

async function getConversionsForAgent(
  userId: string,
): Promise<ConversionRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, deal_value, deal_duration, updated_at")
    .eq("status", "won")
    .eq("assigned_to", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[ConversionsPage] fetch error:", error.message);
    return [];
  }

  return (data ?? []) as ConversionRow[];
}

// ── Page ──────────────────────────────────────────────────

export default async function ConversionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  if (profile.role !== "agent") {
    return (
      <LeaderPerspectiveNotice
        title="My Conversions"
        subtitle="Agent perspective"
        body="This table lists wins tied to the signed-in agent account. For organization-wide sales analytics, open the Command Center."
        ctaHref="/manager/dashboard"
        ctaLabel="Open Command Center"
      />
    );
  }

  const conversions = await getConversionsForAgent(user.id);
  const totalValue = conversions.reduce(
    (sum, c) => sum + (c.deal_value ?? 0),
    0,
  );
  const formattedTotal =
    totalValue > 0 ? "₹ " + totalValue.toLocaleString("en-IN") : null;

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="My Conversions."
        subtitle="A history of your finalized memberships."
      />

      <div className="px-8 py-8 max-w-[1100px] mx-auto space-y-6">
        {/* ── Summary strip ─────────────────────────────── */}
        {conversions.length > 0 && (
          <div className="flex items-center gap-6">
            {/* Total deals */}
            <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-[#2f5039] border border-white/[0.07]">
              <div className="w-8 h-8 rounded-lg bg-[#341343]/10 border border-[#D4AF37]/20 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-white/[0.80] uppercase tracking-widest leading-none mb-1">
                  Deals Closed
                </p>
                <p className="text-xl font-semibold text-white/90 tabular-nums leading-none">
                  {conversions.length}
                </p>
              </div>
            </div>

            {/* Total revenue */}
            {formattedTotal && (
              <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-[#6e511c] border border-white/[0.07]">
                <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center">
                  <span className="text-[#D4AF37] text-sm font-bold leading-none">
                    ₹
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-white/[0.28] uppercase tracking-widest leading-none mb-1">
                    Total Revenue
                  </p>
                  <p className="text-xl font-semibold text-[#D4AF37] tabular-nums leading-none">
                    {formattedTotal}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Conversions table ──────────────────────────── */}
        <div className="rounded-2xl bg-[#2f5039] border border-white/[0.07] overflow-hidden shadow-[0_2px_24px_0_rgb(0_0_0/0.18)]">
          <ConversionsTable conversions={conversions} />
        </div>
      </div>
    </div>
  );
}
