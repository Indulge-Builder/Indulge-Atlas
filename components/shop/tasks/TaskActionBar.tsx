"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addTaskProgress } from "@/lib/actions/tasks";
import { RegisterSaleForm } from "@/components/shop/tasks/RegisterSaleForm";

export function TaskActionBar({
  taskId,
  productLabel,
}: {
  taskId: string;
  productLabel: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [saleOpen, setSaleOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function logUpdate() {
    const trimmed = note.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await addTaskProgress(taskId, trimmed);
      if (res.success) {
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <div className="border-t border-stone-200/90 bg-stone-100/95 backdrop-blur-md px-4 py-4 md:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6 max-w-6xl mx-auto w-full">
        <div className="flex flex-1 flex-col gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">
            Log update
          </span>
          <div className="flex gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Nudged client about the tickets"
              className="rounded-xl border-stone-200 bg-stone-50/50 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  logUpdate();
                }
              }}
            />
            <Button
              type="button"
              onClick={logUpdate}
              disabled={pending || !note.trim()}
              className="rounded-xl shrink-0 bg-stone-900 text-white hover:bg-stone-800"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
            </Button>
          </div>
        </div>

        <DialogPrimitive.Root open={saleOpen} onOpenChange={setSaleOpen}>
          <DialogPrimitive.Trigger asChild>
            <Button
              type="button"
              className="rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 shadow-[0_4px_20px_-4px_rgb(16_185_129/0.35)] px-6 py-6 h-auto md:h-11 md:py-0"
            >
              Register sale
            </Button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-sm" />
            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="fixed left-1/2 top-1/2 z-[61] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/[0.05]"
              >
                <DialogPrimitive.Title className="text-lg font-semibold text-stone-900 mb-1">
                  Register sale
                </DialogPrimitive.Title>
                <p className="text-xs text-stone-500 mb-4">
                  Creates a shop order, increments progress, and posts to the feed.
                </p>
                <RegisterSaleForm
                  taskId={taskId}
                  productLabel={productLabel}
                  onCancel={() => setSaleOpen(false)}
                  onSuccess={() => setSaleOpen(false)}
                />
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>
    </div>
  );
}
