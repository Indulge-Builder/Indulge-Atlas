"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

type Props = {
  text: string;
  className?: string;
};

export function BriefingSummaryCopy({ text, className }: Props) {
  return (
    <button
      type="button"
      className={
        className ??
        "rounded-md p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
      }
      aria-label="Copy briefing to clipboard"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            toast.success("Briefing copied to clipboard");
          },
          () => {
            toast.error("Could not copy — try again");
          },
        );
      }}
    >
      <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
