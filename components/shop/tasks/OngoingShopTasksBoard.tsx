import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { AvatarStack } from "@/components/ui/avatar-stack";
import type { ShopTaskRow } from "@/lib/actions/shop-tasks";

function priorityTone(p?: string) {
  if (p === "super_high") return "bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/20";
  if (p === "high") return "bg-amber-500/12 text-amber-900 ring-1 ring-amber-500/25";
  return "bg-stone-500/10 text-stone-700 ring-1 ring-stone-400/25";
}

export function OngoingShopTasksBoard({ tasks }: { tasks: ShopTaskRow[] }) {
  return (
    <section
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "sm", overflow: "visible" }),
        "p-6",
      )}
    >
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-[#1A1A1A]">
            Ongoing tasks
          </h2>
          <p className="mt-1 text-xs text-[#6B6B6B]">
            Click any operation to open the war room
          </p>
        </div>
        <span className="text-xs text-stone-500 tabular-nums">
          {tasks.length} active
        </span>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E5E4DF] bg-[#FAFAF8] px-4 py-10 text-center text-sm text-[#6B6B6B]">
          No ongoing shop tasks yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {tasks.map((t) => {
            const deadlineIso = t.deadline ?? t.due_date;
            const deadline = new Date(deadlineIso);
            const product = t.shop_product_name?.trim() || t.title;
            const target = t.target_inventory ?? null;
            const sold = t.target_sold ?? 0;
            const pct =
              target != null && target > 0
                ? Math.min(100, Math.round((sold / target) * 100))
                : 0;

            return (
              <Link
                key={t.id}
                href={`/shop/workspace/tasks/${t.id}`}
                className={cn(
                  surfaceCardVariants({ tone: "subtle", elevation: "xs", overflow: "hidden" }),
                  "group p-4 transition-shadow hover:shadow-[0_10px_30px_-18px_rgb(0_0_0/0.22)]",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="text-base font-semibold text-stone-900 tracking-tight truncate"
                      style={{ fontFamily: "var(--font-playfair)" }}
                      title={product}
                    >
                      {product}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Due {formatDistanceToNow(deadline, { addSuffix: true })}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                      priorityTone(t.shop_task_priority),
                    )}
                  >
                    {(t.shop_task_priority ?? "normal").replace("_", " ")}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <AvatarStack assignees={t.assigned_to_profiles ?? []} maxVisible={3} size="sm" />
                  {target != null && target > 0 ? (
                    <span className="text-xs text-stone-600 tabular-nums">
                      {sold}/{target}
                    </span>
                  ) : (
                    <span className="text-xs text-stone-500">
                      {t.shop_operation_scope === "group" ? "Group" : "Individual"}
                    </span>
                  )}
                </div>

                {target != null && target > 0 && (
                  <div className="mt-3 h-3 w-full rounded-full bg-stone-200/90 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-emerald-700 to-emerald-500 transition-[width] duration-500 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

