"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogPortal,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Pencil, X, Loader2, MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateLeadDemographics } from "@/lib/actions/leads";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const schema = z.object({
  city:             z.string().max(100).optional(),
  personal_details: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

interface EditDemographicsModalProps {
  leadId:  string;
  current: {
    city:             string | null;
    personal_details: string | null;
  };
}

export function EditDemographicsModal({
  leadId,
  current,
}: EditDemographicsModalProps) {
  const [open, setOpen]             = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      city:             current.city ?? "",
      personal_details: current.personal_details ?? "",
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const result = await updateLeadDemographics(leadId, {
      city:             values.city || null,
      personal_details: values.personal_details || null,
    });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error ?? "Could not save changes.");
      return;
    }

    toast.success("Demographics updated.");
    setOpen(false);
    router.refresh();
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset({
      city:             current.city ?? "",
      personal_details: current.personal_details ?? "",
    });
    setOpen(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <button className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider hover:text-[#D4AF37] transition-colors">
          <Pencil className="w-3 h-3" />
          Edit
        </button>
      </DialogPrimitive.Trigger>

      <DialogPortal>
        <DialogPrimitive.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "transform, opacity" }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2
                       bg-white rounded-2xl shadow-2xl border border-[#EAEAEA] p-6"
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <DialogTitle
                  className="text-[#1A1A1A] text-base font-semibold"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  Client Demographics
                </DialogTitle>
                <DialogDescription className="text-[#9E9E9E] text-xs mt-0.5">
                  Update location and client persona details
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <button className="p-1.5 rounded-lg text-[#9E9E9E] hover:text-[#1A1A1A] hover:bg-[#F4F4F0] transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </DialogClose>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Field
                icon={MapPin}
                label="City"
                error={errors.city?.message}
              >
                <Input
                  {...register("city")}
                  placeholder="e.g. Dubai"
                  className={inputCx}
                />
              </Field>

              <Field
                icon={Sparkles}
                label="Client Persona & Interests"
                error={errors.personal_details?.message}
                hint="Lifestyle, hobbies, yacht preferences, watch brands…"
              >
                <Textarea
                  {...register("personal_details")}
                  placeholder="e.g. Collector of vintage Rolexes, interested in superyacht charters, prefers bespoke concierge services…"
                  rows={5}
                  className={cn(inputCx, "resize-none text-[13px] leading-relaxed")}
                />
              </Field>

              <div className="flex gap-3 pt-1">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-10 rounded-xl border-[#E8E8E0] text-[#4A4A4A] text-sm"
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-10 rounded-xl bg-[#1A1A1A] text-white hover:bg-[#2A2A2A] text-sm font-medium"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving…
                    </span>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </form>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

// ── Sub-components ─────────────────────────────────────────

const inputCx = cn(
  "h-10 text-sm bg-[#FAFAF8] border-[#E8E8E0]",
  "focus-visible:ring-1 focus-visible:ring-[#D4AF37]/40 rounded-xl"
);

function Field({
  icon: Icon,
  label,
  error,
  hint,
  children,
}: {
  icon: React.ElementType;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-widest">
        <Icon className="w-3 h-3" />
        {label}
      </Label>
      {hint && (
        <p className="text-[10px] text-[#B5A99A] -mt-0.5 italic">{hint}</p>
      )}
      {children}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-[11px] text-[#C0392B]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
