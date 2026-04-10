"use client";

import { useForm, type Resolver } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerTaskSale } from "@/lib/actions/shop-tasks";

const schema = z.object({
  customerName: z.string().min(1, "Name is required").max(200),
  customerPhone: z.string().min(5, "Phone is required").max(40),
  dealAmount: z.number().nonnegative(),
});

type Values = z.infer<typeof schema>;

export function RegisterSaleForm({
  taskId,
  productLabel,
  onSuccess,
  onCancel,
}: {
  taskId: string;
  productLabel: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: { customerName: "", customerPhone: "", dealAmount: 0 },
  });

  async function onSubmit(values: Values) {
    const res = await registerTaskSale(undefined, {
      taskId,
      customerName: values.customerName,
      customerPhone: values.customerPhone,
      dealAmount: values.dealAmount,
    });
    if (!res.success) {
      setError("root", { message: res.error ?? "Failed to register sale" });
      return;
    }
    router.refresh();
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">
          Product
        </Label>
        <Input value={productLabel} disabled className="rounded-xl bg-stone-100 text-stone-600" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">
          Customer name
        </Label>
        <Input
          {...register("customerName")}
          placeholder="Full name"
          className="rounded-xl border-stone-200"
        />
        {errors.customerName && (
          <p className="text-[11px] text-rose-600">{errors.customerName.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">
          Customer phone
        </Label>
        <Input
          {...register("customerPhone")}
          placeholder="+91 …"
          className="rounded-xl border-stone-200"
        />
        {errors.customerPhone && (
          <p className="text-[11px] text-rose-600">{errors.customerPhone.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">
          Deal amount
        </Label>
        <Input
          type="number"
          step="0.01"
          min={0}
          {...register("dealAmount", { valueAsNumber: true })}
          className="rounded-xl border-stone-200"
        />
        {errors.dealAmount && (
          <p className="text-[11px] text-rose-600">{errors.dealAmount.message}</p>
        )}
      </div>
      {errors.root && (
        <p className="text-sm text-rose-600">{errors.root.message}</p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" className="rounded-xl" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 min-w-[120px]"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm sale"}
        </Button>
      </div>
    </form>
  );
}
