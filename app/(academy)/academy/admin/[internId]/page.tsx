import { notFound } from "next/navigation";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { AcademyTopBar } from "@/components/academy/AcademyTopBar";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole } from "@/lib/types/database";
import { getTraineeProfile } from "@/lib/actions/academy-analytics";
import { TraineeProfileView } from "@/components/academy/admin/TraineeProfileView";

export const dynamic = "force-dynamic";

export default async function TraineeAnalyticsPage({
  params,
}: {
  params: Promise<{ internId: string }>;
}) {
  const { role } = await getAuthUser();
  // Admin-only: the scenario library holds the answer key, and analytics is
  // the cohort-wide dashboard. Trainers use the Cohort tab instead. Enforced
  // here, not merely hidden in the nav.
  if (!isPrivilegedRole(role)) notFound();

  const { internId } = await params;
  const res = await getTraineeProfile(internId);

  return (
    <div className="min-h-full">
      <AcademyTopBar
        title={res.success ? res.data!.trainee.name : "Trainee"}
        subtitle="Individual performance analysis"
      />

      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
        {!res.success ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-light px-4 py-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <div>
                <p className="text-[13px] font-medium text-danger">
                  Could not load this trainee
                </p>
                <p className="mt-0.5 text-[12px] text-danger/80">{res.error}</p>
              </div>
            </div>
            <Link
              href="/academy/admin"
              className="text-[12.5px] font-medium text-brand-gold hover:underline"
            >
              ← Back to dashboard
            </Link>
          </div>
        ) : (
          <TraineeProfileView
            profile={res.data!}
            academyAvgResponseMinutes={res.data!.academyAvgResponseMinutes}
            academyAvgResolutionMinutes={res.data!.academyAvgResolutionMinutes}
          />
        )}
      </div>
    </div>
  );
}
