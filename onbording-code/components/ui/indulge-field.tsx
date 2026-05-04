import * as React from "react";
import { Label } from "./label";
import { cn } from "@/lib/utils";

interface IndulgeFieldProps {
  /** Input label — rendered as an uppercase tracking label above the control. */
  label?: string;
  /** Validation error message — renders below the control in red. */
  error?: string;
  /** Helper/hint text — rendered below control in muted taupe (hidden when `error` is set). */
  hint?: string;
  /** Appends a red asterisk after the label. */
  required?: boolean;
  /** `for` attribute wired to the child input `id`. */
  htmlFor?: string;
  /** The control (Input, Select, Textarea, etc.). */
  children: React.ReactNode;
  className?: string;
  labelClassName?: string;
}

/**
 * IndulgeField — semantic form-field wrapper.
 *
 * Composes the "Light Quiet Luxury" label style, a control slot, and
 * error / hint messaging into one consistent unit used across all forms.
 *
 * ```tsx
 * <IndulgeField label="Campaign name" error={errors.title?.message} required>
 *   <Input {...register("title")} error={!!errors.title} />
 * </IndulgeField>
 * ```
 */
export function IndulgeField({
  label,
  error,
  hint,
  required,
  htmlFor,
  children,
  className,
  labelClassName,
}: IndulgeFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label
          htmlFor={htmlFor}
          className={cn(
            "text-[11px] font-semibold uppercase tracking-widest text-[#6B6B6B]",
            labelClassName,
          )}
        >
          {label}
          {required && (
            <span className="ml-0.5 text-[#C0392B]" aria-hidden>
              *
            </span>
          )}
        </Label>
      )}

      {children}

      {error ? (
        <p className="text-[11px] leading-tight text-[#C0392B]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] leading-tight text-[#B5A99A]">{hint}</p>
      ) : null}
    </div>
  );
}
