"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (!ref.current) return;
      const lineHeight =
        Number.parseFloat(getComputedStyle(ref.current).lineHeight) || 20;
      const maxCollapsed = lineHeight * 2 + 2;
      setNeedsToggle(ref.current.scrollHeight > maxCollapsed + 1);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [text]);

  return (
    <div className="min-w-0">
      <p
        ref={ref}
        className={cn(
          "text-[13px] font-normal leading-relaxed text-[#1C1917] transition-[max-height] duration-150 ease-out",
          expanded ? "max-h-[min(70vh,2400px)]" : "line-clamp-2 max-h-[2.75rem]",
        )}
      >
        {text}
      </p>
      {needsToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 cursor-pointer text-left text-[11px] text-[#D4AF37] hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}
