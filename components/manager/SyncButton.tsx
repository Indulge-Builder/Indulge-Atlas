"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { syncCampaignData } from "@/lib/actions/manager";
import { cn } from "@/lib/utils";

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncCampaignData();
      if (result.success) {
        toast.success(result.message, {
          description: "All campaign metrics have been refreshed.",
          duration: 4000,
        });
      } else {
        toast.error("Sync failed", {
          description: result.message,
        });
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleSync}
      disabled={syncing}
      className={cn(
        "flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
        "bg-[#0A0A0A] text-white border border-[#2A2A2A]",
        "hover:bg-[#1A1A1A] hover:border-[#D4AF37]/30",
        "disabled:opacity-50 disabled:cursor-not-allowed"
      )}
    >
      <RefreshCw
        className={cn("w-4 h-4", syncing && "animate-spin")}
      />
      {syncing ? "Syncing…" : "Sync Latest Data"}
    </motion.button>
  );
}
