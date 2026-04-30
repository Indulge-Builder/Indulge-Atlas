"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutGrid, User } from "lucide-react";

const TABS = [
  { id: "atlas", label: "Group Tasks", icon: LayoutGrid },
  { id: "mine",  label: "My Tasks",    icon: User },
] as const;

export function TasksTabBar() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();
  const activeView   = searchParams.get("view") ?? "atlas";

  function switchTab(view: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "atlas") {
      params.delete("view");
    } else {
      params.set("view", view);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }

  return (
    <div
      className="flex gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1"
      role="tablist"
      aria-label="Task view"
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = activeView === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            onClick={() => switchTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all",
              isActive
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
