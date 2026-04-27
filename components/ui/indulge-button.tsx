"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { cn } from "@/lib/utils";

export interface IndulgeButtonProps extends ButtonProps {
  /** Show a centered spinner and disable the button while true. */
  loading?: boolean;
  /** Icon rendered to the left of children (hidden while loading). */
  leftIcon?: React.ReactNode;
  /** Icon rendered to the right of children (hidden while loading). */
  rightIcon?: React.ReactNode;
}

/**
 * IndulgeButton — the "Light Quiet Luxury" button primitive.
 *
 * Extends `Button` with:
 *  - `loading` prop: shows a centered `Loader2` spinner, disables interaction
 *  - `leftIcon` / `rightIcon`: decorative icon slots that vanish during loading
 *
 * All existing `Button` variants and sizes (default, gold, outline, ghost, etc.)
 * are preserved. Pass them as normal:
 *
 * ```tsx
 * <IndulgeButton variant="gold" loading={isPending}>Save changes</IndulgeButton>
 * <IndulgeButton leftIcon={<Plus className="h-4 w-4" />}>New lead</IndulgeButton>
 * ```
 */
const IndulgeButton = React.forwardRef<HTMLButtonElement, IndulgeButtonProps>(
  (
    {
      loading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <Button
        ref={ref}
        disabled={disabled || loading}
        className={cn(loading && "cursor-wait", className)}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </Button>
    );
  },
);
IndulgeButton.displayName = "IndulgeButton";

export { IndulgeButton };
