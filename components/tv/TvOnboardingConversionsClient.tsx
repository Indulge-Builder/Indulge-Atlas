"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/utils";

export interface TvFeedRow {
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

export function TvOnboardingConversionsClient({
  token,
  initialRows,
}: {
  token: string;
  initialRows: TvFeedRow[];
}) {
  const [rows, setRows] = useState<TvFeedRow[]>(initialRows);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(
          `/api/tv/onboarding-feed?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { rows?: TvFeedRow[] };
        if (Array.isArray(json.rows)) {
          setRows(json.rows);
        }
      } catch {
        /* ignore transient network errors on TV */
      }
    }

    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  const latest = rows[0];

  return (
    <div className="flex min-h-screen flex-col bg-[#0D0C0A] text-white">
      <header className="border-b border-white/[0.08] px-10 py-8">
        <p className="font-[family-name:var(--font-playfair)] text-4xl font-semibold tracking-tight text-[#D4AF37] md:text-5xl">
          Onboarding conversions
        </p>
        <p className="mt-2 text-lg text-white/45">
          Live feed — updates every few seconds
        </p>
      </header>

      {latest && (
        <section className="border-b border-white/[0.08] bg-gradient-to-br from-[#1a1814] to-[#0D0C0A] px-10 py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4AF37]/80">
            Latest sale
          </p>
          <p className="mt-4 font-[family-name:var(--font-playfair)] text-4xl font-medium leading-tight text-white md:text-6xl">
            {latest.client_name}
          </p>
          <div className="mt-8 flex flex-wrap items-end gap-10">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/35">
                Amount
              </p>
              <p className="mt-1 text-4xl font-semibold tabular-nums text-[#D4AF37] md:text-5xl">
                {formatAmount(latest.amount)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-white/35">
                Agent
              </p>
              <p className="mt-1 text-2xl text-white/90 md:text-3xl">
                {latest.agent_name}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-white/35">
                Owner
              </p>
              <p className="mt-1 text-2xl text-white/90 md:text-3xl">
                {latest.assigned_to}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="flex-1 px-10 py-10">
        <p className="mb-6 text-xs font-semibold uppercase tracking-widest text-white/35">
          Recent ({rows.length})
        </p>
        <div className="overflow-hidden rounded-2xl border border-white/[0.1]">
          <table className="w-full text-left text-base md:text-lg">
            <thead>
              <tr className="border-b border-white/[0.1] bg-white/[0.04] text-xs uppercase tracking-wider text-white/40">
                <th className="px-5 py-4 font-semibold">Client</th>
                <th className="px-5 py-4 font-semibold">Amount</th>
                <th className="px-5 py-4 font-semibold">Agent</th>
                <th className="px-5 py-4 font-semibold">Owner</th>
                <th className="px-5 py-4 font-semibold">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-16 text-center text-white/40"
                  >
                    No conversions yet. Log one from Admin → Conversions or your
                    webhook.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-4 font-medium text-white/95">
                      {row.client_name}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-[#D4AF37]">
                      {formatAmount(row.amount)}
                    </td>
                    <td className="px-5 py-4 text-white/75">{row.agent_name}</td>
                    <td className="px-5 py-4 text-white/75">
                      {row.assigned_to}
                    </td>
                    <td className="px-5 py-4 text-sm text-white/45">
                      {formatDateTime(row.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
