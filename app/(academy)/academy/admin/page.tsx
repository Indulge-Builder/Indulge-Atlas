import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { AcademyTopBar } from "@/components/academy/AcademyTopBar";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isAcademyTrainer } from "@/lib/types/database";
import { getAcademyDashboard } from "@/lib/actions/academy-analytics";
import { AdminDashboard } from "@/components/academy/admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AcademyAdminPage() {
  const { role, department } = await getAuthUser();
  // Server-side gate, not a hidden nav link — interns must not reach cohort data.
  if (!isAcademyTrainer(role, department)) notFound();

  const res = await getAcademyDashboard();

  return (
    <div className="min-h-full">
      <AcademyTopBar
        title="Training analytics"
        subtitle="Cohort performance, rankings and coaching signal — all from recorded training activity"
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
        {!res.success ? (
          <div className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-light px-4 py-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <div>
              <p className="text-[13px] font-medium text-danger">
                Could not load the dashboard
              </p>
              <p className="mt-0.5 text-[12px] text-danger/80">{res.error}</p>
            </div>
          </div>
        ) : res.data!.trainees.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-border bg-surface-subtle px-5 py-12 text-center">
            <p className="font-serif text-[16px] text-black/70">No academy activity yet</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-black/45">
              Figures appear here as soon as trainees start handling requests. Nothing
              is shown until there is real data behind it.
            </p>
          </div>
        ) : (
          <AdminDashboard kpis={res.data!.kpis} trainees={res.data!.trainees} />
        )}
      </div>
    </div>
  );
}
