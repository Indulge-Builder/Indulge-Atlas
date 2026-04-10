import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { AdminOnboardingConversionsTable } from "@/components/admin/AdminOnboardingConversionsTable";
import type { OnboardingConversionLeadRow } from "@/components/admin/AdminOnboardingConversionsTable";
import { RecordConversionForm } from "@/components/admin/RecordConversionForm";

export const dynamic = "force-dynamic";

export default async function AdminConversionsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (rawProfile as { role: string } | null)?.role;
  if (role !== "admin") {
    redirect("/");
  }

  const { data, error } = await supabase
    .from("onboarding_leads")
    .select("id, client_name, amount, agent_name, assigned_to, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/conversions]", error.message);
  }

  const rows = (data ?? []) as OnboardingConversionLeadRow[];

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="Conversions"
        subtitle="Log onboarding sales, webhook feed, and live TV display"
      />

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="mb-6 flex items-start gap-4 rounded-xl border border-[#E5E4DF] bg-white p-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/10">
            <Trophy className="h-5 w-5 text-[#B8941F]" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium text-[#1A1A1A]">
              Central onboarding feed
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[#6B6B6B]">
              <span className="font-medium text-[#3D3D3D]">Manual:</span> use the
              form below. <span className="font-medium text-[#3D3D3D]">
                Automated:
              </span>{" "}
              POST to{" "}
              <code className="rounded bg-[#F4F3EF] px-1.5 py-0.5 text-xs text-[#1A1A1A]">
                /api/webhooks/onboarding-conversion
              </code>{" "}
              with your Bearer secret.{" "}
              <span className="font-medium text-[#3D3D3D]">TV:</span> open{" "}
              <code className="rounded bg-[#F4F3EF] px-1.5 py-0.5 text-xs text-[#1A1A1A]">
                /tv/conversions?token=…
              </code>{" "}
              where <code className="text-xs">token</code> matches{" "}
              <code className="text-xs">TV_DASHBOARD_SECRET</code> in production
              (same URL on your browser or casting device).
            </p>
          </div>
        </div>

        <div className="mb-8">
          <RecordConversionForm />
        </div>

        <AdminOnboardingConversionsTable rows={rows} />
      </div>
    </div>
  );
}
