import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import type { ShopOrderRow } from "@/lib/actions/shop";
import type { ShopOrderStatus } from "@/lib/types/database";

function formatInr(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function shortId(id: string) {
  return `${id.slice(0, 8)}…`;
}

const STATUS_BADGE: Record<
  ShopOrderStatus,
  { label: string; className: string }
> = {
  delivered: {
    label: "Delivered",
    className: "bg-emerald-500/12 text-emerald-800 ring-1 ring-emerald-500/25",
  },
  pending: {
    label: "Pending",
    className: "bg-amber-500/12 text-amber-900 ring-1 ring-amber-500/25",
  },
  processing: {
    label: "Processing",
    className: "bg-sky-500/12 text-sky-900 ring-1 ring-sky-500/25",
  },
  shipped: {
    label: "Shipped",
    className: "bg-violet-500/12 text-violet-900 ring-1 ring-violet-500/25",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-stone-400/15 text-stone-700 ring-1 ring-stone-400/25",
  },
};

export function OrderPipeline({ orders }: { orders: ShopOrderRow[] }) {
  return (
    <section
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
        "overflow-visible p-6",
      )}
    >
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-[#1A1A1A]">
            Order pipeline
          </h2>
          <p className="mt-1 text-xs text-[#6B6B6B]">
            Lifecycle from pending through delivered
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E5E4DF] bg-[#FAFAF8] px-4 py-10 text-center text-sm text-[#6B6B6B]">
          No shop orders yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#ECEBE6] text-[11px] font-semibold uppercase tracking-wider text-[#8B8B7E]">
                <th className="pb-3 pr-4 font-medium">Order</th>
                <th className="pb-3 pr-4 font-medium">Lead</th>
                <th className="pb-3 pr-4 font-medium">Product</th>
                <th className="pb-3 pr-4 font-medium tabular-nums">Amount</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="text-[#1A1A1A]">
              {orders.map((row) => {
                const lead = row.leads;
                const name = lead
                  ? [lead.first_name, lead.last_name].filter(Boolean).join(" ")
                  : row.customer_name?.trim() || "—";
                const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.pending;

                return (
                  <tr
                    key={row.id}
                    className="border-b border-[#F2F2EE] last:border-0"
                  >
                    <td className="py-3.5 pr-4 font-mono text-xs text-[#4A4A4A]">
                      {shortId(row.id)}
                    </td>
                    <td className="py-3.5 pr-4 font-medium">{name}</td>
                    <td className="py-3.5 pr-4 text-[#3D3D3D]">
                      {row.product_name}
                    </td>
                    <td className="py-3.5 pr-4 tabular-nums text-[#3D3D3D]">
                      {formatInr(row.amount)}
                    </td>
                    <td className="py-3.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
