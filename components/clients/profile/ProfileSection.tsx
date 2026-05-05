import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfileSection({
  title,
  icon: SectionIcon,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex items-center gap-2.5 rounded-t-lg border border-b-0 border-[#E5E4DF] bg-[#F5F3EE] px-4 py-2.5">
        <SectionIcon className="h-3.5 w-3.5 shrink-0 text-brand-gold" aria-hidden />
        <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-600">
          {title}
        </span>
      </div>
      <div className="divide-y divide-[#F5F3EF] rounded-b-lg border border-t-0 border-[#E5E4DF] bg-white">
        {children}
      </div>
    </div>
  );
}
