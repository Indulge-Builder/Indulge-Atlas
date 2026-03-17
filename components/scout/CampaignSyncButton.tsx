"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

async function syncCampaigns(): Promise<{ updated_count: number; warning?: string }> {
  const res = await fetch("/api/campaigns/sync", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? data.details ?? "Sync failed");
  }

  return {
    updated_count: data.updated_count ?? 0,
    warning: data.warning,
  };
}

export function CampaignSyncButton() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      await toast.promise(syncCampaigns(), {
        loading: "Fetching latest ad intelligence…",
        success: (result) => {
          router.refresh();
          return result.warning ?? "Command center synchronized";
        },
        error: (err) => err instanceof Error ? err.message : "Sync failed",
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className={cn(
        "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all shadow-sm",
        "bg-stone-900 text-white hover:bg-stone-800",
        "disabled:opacity-50 disabled:cursor-not-allowed"
      )}
      aria-label="Sync campaign data"
    >
      <RefreshCw
        className={cn("w-4 h-4", syncing && "animate-spin")}
        aria-hidden
      />
      <span>{syncing ? "Syncing…" : "Sync Data"}</span>
    </button>
  );
}
