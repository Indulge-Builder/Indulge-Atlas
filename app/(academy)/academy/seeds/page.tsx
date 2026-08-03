import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { AcademyTopBar } from "@/components/academy/AcademyTopBar";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole } from "@/lib/types/database";
import { getSeedsForTrainer } from "@/lib/actions/academy";
import { SeedEditor } from "@/components/academy/SeedEditor";
import type { ScenarioSeed } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function AcademySeedsPage() {
  const { role } = await getAuthUser();
  // Admin-only: the scenario library holds the answer key, and analytics is
  // the cohort-wide dashboard. Trainers use the Cohort tab instead. Enforced
  // here, not merely hidden in the nav.
  if (!isPrivilegedRole(role)) notFound();

  const res = await getSeedsForTrainer();
  const seeds: ScenarioSeed[] = res.success ? res.data ?? [] : [];

  return (
    <div className="min-h-full">
      <AcademyTopBar
        title="Indulge Training scenarios"
        subtitle="Author the seed library — synthetic members only, never real client data"
      />

      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="mb-6">
          <Link
            href="/academy"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-black/45 transition-colors duration-150 hover:text-brand-gold"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to Indulge Training
          </Link>
        </div>

        {!res.success ? (
          <div className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-light px-4 py-3">
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-danger"
              aria-hidden
            />
            <div>
              <p className="text-[13px] font-medium text-danger">
                Could not load the scenario library
              </p>
              <p className="mt-0.5 text-[12px] text-danger/80">{res.error}</p>
            </div>
          </div>
        ) : (
          <SeedEditor seeds={seeds} />
        )}
      </div>
    </div>
  );
}
