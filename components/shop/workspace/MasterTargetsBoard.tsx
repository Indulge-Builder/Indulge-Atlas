"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createTargetUpdate,
  type MasterTargetWithSla,
  type TargetUpdateResult,
} from "@/lib/actions/shop";

export function MasterTargetsBoard({
  targets,
}: {
  targets: MasterTargetWithSla[];
}) {
  const [open, setOpen] = useState(false);
  const [activeTarget, setActiveTarget] = useState<MasterTargetWithSla | null>(
    null,
  );

  const [state, formAction, isPending] = useActionState(
    createTargetUpdate,
    undefined as TargetUpdateResult | undefined,
  );

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success("Update logged.");
      setOpen(false);
      setActiveTarget(null);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  function openFor(t: MasterTargetWithSla) {
    setActiveTarget(t);
    setOpen(true);
  }

  return (
    <>
      <section
        className={cn(
          surfaceCardVariants({ tone: "subtle", elevation: "sm" }),
          "overflow-visible p-6",
        )}
      >
        <div className="mb-5">
          <h2 className="text-sm font-semibold tracking-tight text-[#1A1A1A]">
            Master targets
          </h2>
          <p className="mt-1 text-xs text-[#6B6B6B]">
            Inventory SLA — log progress to stay ahead of the pulse
          </p>
        </div>

        {targets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#EAEAEA] bg-[#FAFAFA] px-4 py-10 text-center text-sm text-[#6B6B6B]">
            No active targets.
          </p>
        ) : (
          <ul className="flex flex-col gap-6">
            {targets.map((t) => {
              const pct =
                t.inventory_total > 0
                  ? Math.min(
                      100,
                      Math.round((t.inventory_sold / t.inventory_total) * 100),
                    )
                  : 0;

              return (
                <li
                  key={t.id}
                  className="rounded-xl border border-[#ECEBE6] bg-[#FAFAF8]/80 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#1A1A1A]">
                        {t.title}
                      </p>
                      <p className="mt-1 text-xs text-[#6B6B6B]">
                        {t.inventory_sold} / {t.inventory_total} units
                      </p>
                    </div>
                    {t.is_breached && (
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-rose-500 animate-pulse"
                          aria-hidden
                        />
                        <span className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
                          UPDATE REQUIRED
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#E8E7E2]">
                    <div
                      className="h-full rounded-full bg-[#0D9488]/85 transition-[width] duration-500 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="mt-4 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg border-[#E5E4DF] text-xs font-medium"
                      onClick={() => openFor(t)}
                    >
                      Log update
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log target update</DialogTitle>
            <DialogDescription>
              {activeTarget ? (
                <>
                  Add notes and units sold for{" "}
                  <span className="font-medium text-[#3D3D3D]">
                    {activeTarget.title}
                  </span>
                  .
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="targetId" value={activeTarget?.id ?? ""} />

            <div className="space-y-2">
              <Label htmlFor="unitsSold">Units sold (this update)</Label>
              <Input
                id="unitsSold"
                name="unitsSold"
                type="number"
                min={0}
                step={1}
                placeholder="0"
                defaultValue={0}
                className="rounded-xl border-[#E5E4DF]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                rows={4}
                placeholder="What moved the needle?"
                className="resize-none rounded-xl border-[#E5E4DF]"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || !activeTarget}
                className="min-w-[120px]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Submit"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
