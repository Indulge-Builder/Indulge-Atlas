import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * CVA token map for the Input primitive.
 *
 * `inputSize` controls height + padding. Use the `size` prop alias on
 * `InputProps` so callers don't have to type "inputSize" (CVA reserves "size"
 * as a DOM attribute so we rename internally).
 *
 * `state` drives border/ring colour:
 *   - default  → gold focus ring  (#D4AF37)
 *   - error    → red  focus ring  (#C0392B)
 */
const inputVariants = cva(
  [
    "flex w-full rounded-md border bg-white",
    "text-[#1A1A1A] placeholder:text-[#B5A99A]",
    "transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "file:border-0 file:bg-transparent file:text-sm file:font-medium",
  ].join(" "),
  {
    variants: {
      inputSize: {
        sm:      "h-8  px-2.5 py-1   text-xs",
        default: "h-9  px-3   py-1   text-sm",
        lg:      "h-10 px-3.5 py-2   text-sm",
        xl:      "h-11 px-4   py-2.5 text-base",
      },
      state: {
        default:
          "border-[#E5E4DF] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37]",
        error:
          "border-[#C0392B] focus:outline-none focus:ring-2 focus:ring-[#C0392B]/25 focus:border-[#C0392B]",
      },
    },
    defaultVariants: {
      inputSize: "default",
      state:     "default",
    },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Maps to the `inputSize` CVA variant: "sm" | "default" | "lg" | "xl" */
  size?: "sm" | "default" | "lg" | "xl";
  /** When true, renders the error state (red border + ring). */
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "default", error = false, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          inputVariants({
            inputSize: size,
            state: error ? "error" : "default",
          }),
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input, inputVariants };
