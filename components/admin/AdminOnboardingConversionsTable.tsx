import { formatDateTime } from "@/lib/utils";

export interface OnboardingConversionLeadRow {
  id: string;
  client_name: string;
  amount: number | string;
  agent_name: string;
  assigned_to: string;
  created_at: string;
}

function formatAmount(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  return "₹ " + n.toLocaleString("en-IN");
}

export function AdminOnboardingConversionsTable({
  rows,
}: {
  rows: OnboardingConversionLeadRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[#E5E4DF] bg-white px-6 py-14 text-center text-sm text-[#6B6B6B]">
        No onboarding conversions yet. Events appear here when your internal
        webhook posts to{" "}
        <code className="rounded bg-[#F4F3EF] px-1.5 py-0.5 text-xs text-[#1A1A1A]">
          /api/webhooks/onboarding-conversion
        </code>
        .
      </div>
    );
  }

  const total = rows.reduce((sum, r) => {
    const n = typeof r.amount === "string" ? parseFloat(r.amount) : r.amount;
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[#E5E4DF] bg-white px-5 py-4 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
            Records
          </p>
          <p className="text-lg font-semibold tabular-nums text-[#1A1A1A]">
            {rows.length}
          </p>
        </div>
        <div className="h-8 w-px bg-[#E5E4DF]" aria-hidden />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
            Total amount
          </p>
          <p className="text-lg font-semibold tabular-nums text-[#4A7C59]">
            {formatAmount(total)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E5E4DF] bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5E4DF] bg-[#FAFAF8] text-[10px] font-semibold uppercase tracking-wider text-[#9E9E9E]">
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Agent</th>
                <th className="px-4 py-3 font-semibold">Assigned to</th>
                <th className="px-4 py-3 font-semibold">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E4DF]">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="transition-colors hover:bg-[#FAFAF8]/80"
                >
                  <td className="px-4 py-3.5 font-medium text-[#1A1A1A]">
                    {row.client_name}
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-[#1A1A1A]">
                    {formatAmount(row.amount)}
                  </td>
                  <td className="px-4 py-3.5 text-[#3D3D3D]">
                    {row.agent_name}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-2.5 py-0.5 text-xs font-medium text-[#8A6F1B]">
                      {row.assigned_to}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[#6B6B6B]">
                    {formatDateTime(row.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
